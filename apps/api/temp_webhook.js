  if (!assetId) {
    return reply.status(400).send("assetId query parameter is missing");
  }

  if (event && event.event === 'job.completed') {
    try {
      // 1. Fetch the asset
      const asset = await request.server.prisma.mediaAsset.findUnique({
        where: { id: assetId }
      });

      let duplicateOf = [];

      // Tier 1: Exact Checksum Match 
      if (asset.checksum && asset.fileSize) {
        const exactMatch = await request.server.prisma.mediaAsset.findFirst({
          where : {
            id: { not: assetId },
            checksum: asset.checksum,
            fileSize: asset.fileSize
          }
        });
        if (exactMatch) duplicateOf.push(exactMatch.id);
      }

      // If not an exact match, run the visual check
      if (duplicateOf.length === 0) {

        // Tier 2: Metadata Filter (Find Suspects)
        // If we have duration metadata, use it to narrow down suspects. Otherwise, check all videos.
        const whereClause = { id: { not: assetId } };
        if (asset.durationSeconds) {
          whereClause.durationSeconds = {
            gte: Number(asset.durationSeconds) - 2,
            lte: Number(asset.durationSeconds) + 2
          };
        }

        const suspects = await request.server.prisma.mediaAsset.findMany({
          where: whereClause,
          select: { id: true }
        });
        const suspectIds = suspects.map(s => s.id);

        // Tier 3: Storyboard pHash (The Visual Math)
        const baseKey = asset.filePath; 
        
        // 1. Download and Hash the 5 thumbnails Coconut just created
        for (let i = 1; i <= 5; i++) {
          const thumbKey = `${baseKey}_thumb${i}.jpg`;
          const thumbUrl = await b2Storage.getPresignedUrl(thumbKey, 3600); // 1-hour link
          
          if (thumbUrl) {
            try {
              // DOWNLOAD the image first to strip away the messy B2 URL parameters
              // B2 Eventual Consistency Fix: Retry up to 3 times if the file returns 404
              let fetchResponse = null;
              for (let attempt = 1; attempt <= 3; attempt++) {
                const res = await fetch(thumbUrl);
                if (res.ok) {
                  fetchResponse = res;
                  break;
                }
                if (res.status === 404 && attempt < 3) {
                  // Wait 1.5 seconds and retry
                  await new Promise(resolve => setTimeout(resolve, 1500));
                } else {
                  throw new Error(`Failed to fetch thumbnail (Status: ${res.status})`);
                }
              }
              
              if (!fetchResponse) throw new Error("Thumbnail not found in B2 after 3 attempts");

              const arrayBuffer = await fetchResponse.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);

              // Pass the raw buffer directly to imageHash (outputs a 256-bit Hex String)
              const hashStr = await imageHashAsync({ data: buffer, name: 'thumb.jpg' }, 16, true);
              
              /* Disabled because VideoFrameHash model does not exist yet
              // Save to PostgreSQL
              await request.server.prisma.videoFrameHash.create({
                data: {
                  assetId: assetId,
                  frameIndex: i,
                  hashValue: hashStr
                }
              });
              */
            } catch(e) {
              console.error(`[Webhook] Failed to hash thumb ${i}:`, e.message);
            }
          }
        }

        // 2. PostgreSQL Hamming Distance Calculation (Updated for 256-bit Hex)
        if (suspectIds.length > 0) {
          /* Disabled because VideoFrameHash model does not exist yet
          const duplicateMatches = await request.server.prisma.$queryRawUnsafe(`
            SELECT vfh."assetId", COUNT(*) as match_count
            FROM video_frame_hashes vfh
            JOIN video_frame_hashes new_vfh ON new_vfh."frameIndex" = vfh."frameIndex"
            WHERE new_vfh."assetId" = $1::uuid 
              AND vfh."assetId" = ANY($2::uuid[])
              AND length(replace((('x' || vfh."hashValue")::bit(256) # ('x' || new_vfh."hashValue")::bit(256))::text, '0', '')) <= 15
            GROUP BY vfh."assetId"
            HAVING COUNT(*) >= 3
          `, assetId, suspectIds);
          
          duplicateMatches.forEach(match => duplicateOf.push(match.assetId));
          */
        }
      }

      // Update the database: Mark as ready OR mark as duplicate!
      const compressedKey = request.query.compressedKey;
      
      const updatedMetadata = {
        ...(typeof asset.customMetadata === 'object' ? asset.customMetadata : {}),
        duplicates: duplicateOf,
        ...(compressedKey ? { originalFilePath: asset.filePath } : {})
      };

      const updateData = {
        transcodingStatus: 'completed',
        status: duplicateOf.length > 0 ? 'duplicate' : 'ready',
        customMetadata: updatedMetadata
      };

      if (compressedKey) {
        updateData.filePath = compressedKey;
        updateData.cdnUrl = `/api/media/${encodeURIComponent(compressedKey)}/stream`;
      }

      await request.server.prisma.mediaAsset.update({
        where: { id: assetId },
        data: updateData
      });

      // --- New Architecture Updates ---
      if (newAssetId) {
        await request.server.prisma.transcodeJob.updateMany({
          where: { assetId: newAssetId, provider: "coconut" },
          data: { status: 'completed' }
        });
        
        await request.server.prisma.asset.update({
          where: { id: newAssetId },
          data: { status: duplicateOf.length > 0 ? 'duplicate' : 'active' }
        });

        if (compressedKey) {
          await request.server.prisma.assetFile.create({
            data: {
              assetId: newAssetId,
              fileClass: "proxy",
              fileName: compressedKey.split('/').pop() || 'compressed.mp4',
              filePath: compressedKey,
              sizeBytes: BigInt(0), // Would need HEAD request to get actual size, but 0 is fine for now
              mimeType: 'video/mp4',
              cdnUrl: `/api/media/${encodeURIComponent(compressedKey)}/stream`
            }
          });
        }
      }

      console.log(`[Webhook] Asset ${assetId} marked ready. Duplicates found: ${duplicateOf.length}`);

      // 3. Auto-Cleanup: Delete the 5 temporary thumbnails from B2 to save storage
      const cleanupKey = compressedKey || asset.filePath;
      if (cleanupKey) {
        for (let i = 1; i <= 5; i++) {
          try {
            await b2Storage.permanentlyDeleteFile(`${cleanupKey}_thumb${i}.jpg`);
          } catch (delErr) {
            console.error(`[Webhook] Failed to delete thumb ${i}:`, delErr.message);
          }
        }
        console.log(`[Webhook] Auto-cleaned temporary storyboard thumbnails for asset ${assetId}`);
      }

