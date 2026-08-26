import { PrismaClient } from '@prisma/client';
import { generateHighlights } from './openai.js';

export async function highlightTranscriptForAsset(
  prisma: PrismaClient,
  assetId: string,
  orgId: string,
  force: boolean,
  sceneLabels: string[] = [],
): Promise<'completed' | 'skipped'> {
  const existing = await prisma.aiHighlight.findUnique({ where: { assetId } });
  if (existing && !force) {
    return 'skipped';
  }

  const segments = await prisma.aiTranscriptSegment.findMany({
    where: { assetId },
    orderBy: { ordinal: 'asc' },
    select: { text: true },
  });
  const transcript = segments.map((s) => s.text.trim()).filter(Boolean).join(' ');
  if (!transcript) {
    return 'skipped';
  }

  const { summary, tags } = await generateHighlights({ transcript, sceneLabels });

  await prisma.$transaction(async (tx) => {
    await tx.aiHighlight.upsert({
      where: { assetId },
      create: {
        assetId,
        orgId,
        summary,
        tags,
      },
      update: {
        summary,
        tags,
      },
    });
    await tx.asset.update({
      where: { id: assetId },
      data: { aiTags: tags },
    });
  });

  return 'completed';
}
