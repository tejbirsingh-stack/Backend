/**
 * Noah Media System - Quick Diagnostic Test
 * Tests core functionality to identify upload/browser sync issues
 */

import fs from "fs";
import path from "path";

// Test Configuration
const CONFIG = {
  API_BASE: "http://localhost:3000",
  FRONTEND_BASE: "http://localhost:3001",
  UPLOADS_DIR: path.join(process.cwd(), "uploads"),
  TEST_FILES_DIR: path.join(process.cwd(), "test-files"),
};

console.log("🔍 NOAH MEDIA SYSTEM - QUICK DIAGNOSTIC TEST\n");

// Step 1: Check server status
console.log("[1] Checking Servers...");
try {
  const apiHealth = await fetch(`${CONFIG.API_BASE}/api/health`);
  console.log(
    `✅ API Server: ${apiHealth.ok ? "RUNNING" : "ERROR"} (${apiHealth.status})`
  );
} catch (error) {
  console.log(`❌ API Server: NOT ACCESSIBLE (${error.message})`);
}

try {
  const frontend = await fetch(CONFIG.FRONTEND_BASE);
  console.log(
    `✅ Frontend: ${frontend.ok ? "RUNNING" : "ERROR"} (${frontend.status})`
  );
} catch (error) {
  console.log(`❌ Frontend: NOT ACCESSIBLE (${error.message})`);
}

// Step 2: Check uploads directory
console.log("\n[2] Checking Upload Directory...");
if (!fs.existsSync(CONFIG.UPLOADS_DIR)) {
  fs.mkdirSync(CONFIG.UPLOADS_DIR, { recursive: true });
  console.log("⚠️  Created missing uploads directory");
} else {
  console.log("✅ Uploads directory exists");
}

const uploadedFiles = fs.readdirSync(CONFIG.UPLOADS_DIR);
console.log(`📁 Current uploads: ${uploadedFiles.length} files`);
uploadedFiles.forEach((file) => console.log(`   - ${file}`));

// Step 3: Test API media list
console.log("\n[3] Testing API Media List...");
try {
  const mediaResponse = await fetch(`${CONFIG.API_BASE}/api/media`);
  const mediaData = await mediaResponse.json();

  if (mediaData.success) {
    console.log(`✅ API returns ${mediaData.assets.length} media assets:`);
    mediaData.assets.forEach((item) => {
      console.log(
        `   - ${item.name} (${
          item.type.charAt(0).toUpperCase() + item.type.slice(1)
        }, ${(item.size / 1024 / 1024).toFixed(1)} MB)`
      );
    });
  } else {
    console.log(`❌ API error: ${mediaData.error}`);
  }
} catch (error) {
  console.log(`❌ API call failed: ${error.message}`);
}

// Step 4: Create and upload test file
console.log("\n[4] Testing File Upload...");
try {
  // Create test file
  if (!fs.existsSync(CONFIG.TEST_FILES_DIR)) {
    fs.mkdirSync(CONFIG.TEST_FILES_DIR, { recursive: true });
  }

  const testContent = `Test file created at ${new Date().toISOString()}`;
  const testFilePath = path.join(CONFIG.TEST_FILES_DIR, "diagnostic-test.txt");
  fs.writeFileSync(testFilePath, testContent);

  // Upload test file
  const fileBuffer = fs.readFileSync(testFilePath);
  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: "text/plain" });
  formData.append("file", blob, "diagnostic-test.txt");

  const uploadResponse = await fetch(`${CONFIG.API_BASE}/api/media/upload`, {
    method: "POST",
    body: formData,
  });

  const uploadResult = await uploadResponse.json();

  if (uploadResponse.ok && uploadResult.success) {
    console.log(`✅ Upload successful: ${uploadResult.asset.name}`);
    console.log(`📍 File URL: ${uploadResult.asset.url}`);

    // Check if file exists on disk
    const uploadedFileName = uploadResult.asset.url.split("/").pop();
    const uploadedFilePath = path.join(CONFIG.UPLOADS_DIR, uploadedFileName);

    if (fs.existsSync(uploadedFilePath)) {
      console.log(`✅ File saved to disk: ${uploadedFilePath}`);
    } else {
      console.log(`❌ File NOT found on disk: ${uploadedFilePath}`);
    }
  } else {
    console.log(`❌ Upload failed: ${uploadResult.error || "Unknown error"}`);
  }
} catch (error) {
  console.log(`❌ Upload test failed: ${error.message}`);
}

// Step 5: Test media list refresh
console.log("\n[5] Testing Media List Refresh...");
try {
  const refreshResponse = await fetch(`${CONFIG.API_BASE}/api/media`);
  const refreshData = await refreshResponse.json();

  if (refreshData.success) {
    console.log(`✅ Refreshed media list: ${refreshData.assets.length} assets`);

    // Check if our test file appears
    const testFileFound = refreshData.assets.find(
      (item) =>
        item.name.includes("diagnostic-test") ||
        item.filename?.includes("diagnostic-test")
    );

    if (testFileFound) {
      console.log(`✅ Test file appears in media list: ${testFileFound.name}`);
    } else {
      console.log(`❌ Test file NOT found in media list`);
      console.log("🔍 Available files in API:");
      refreshData.assets.forEach((item) =>
        console.log(`   - ${item.name} (ID: ${item.id})`)
      );
    }
  }
} catch (error) {
  console.log(`❌ Refresh test failed: ${error.message}`);
}

// Step 6: Test static file serving
console.log("\n[6] Testing Static File Access...");
try {
  // Get the latest media list to find a real file to test
  const mediaResponse = await fetch(`${CONFIG.API_BASE}/api/media`);
  const mediaData = await mediaResponse.json();

  if (mediaData.success && mediaData.assets.length > 0) {
    // Use the first real uploaded file (not sample data) for testing
    const testFile = mediaData.assets.find(
      (asset) =>
        asset.url &&
        asset.url.includes(".") &&
        !asset.url.includes("sample-video") &&
        asset.filename
    );

    if (testFile) {
      const testUrl = `${CONFIG.API_BASE}${testFile.url}`;
      console.log(`🔍 Testing static file: ${testFile.name}`);
      console.log(`📍 URL: ${testUrl}`);

      const staticResponse = await fetch(testUrl, { method: "HEAD" });

      if (staticResponse.ok) {
        const contentLength = staticResponse.headers.get("content-length");
        console.log(`✅ Static file accessible`);
        console.log(
          `� Size: ${
            contentLength ? Math.round(contentLength / 1024) + " KB" : "Unknown"
          }`
        );
      } else {
        console.log(`❌ Static file not accessible: ${staticResponse.status}`);
      }
    } else {
      console.log(`⚠️ No suitable test file found`);
    }
  } else {
    console.log(`❌ Could not fetch media list for static test`);
  }
} catch (error) {
  console.log(`❌ Static file test failed: ${error.message}`);
}

console.log("\n🏁 DIAGNOSTIC COMPLETE");
console.log("\n💡 TROUBLESHOOTING TIPS:");
console.log(
  "1. If uploads work but media browser is empty: Check frontend API connection"
);
console.log("2. If files save but URLs are wrong: Check static file serving");
console.log("3. If media list is stale: Add refresh functionality");
console.log("4. Check browser network tab for CORS or fetch errors");
