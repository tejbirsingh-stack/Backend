#!/usr/bin/env node

/**
 * Noah Media System - Comprehensive Testing Script
 * Tests all features: Upload, Storage, API, Preview, Advanced Features
 */

const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

// Test Configuration
const CONFIG = {
  API_BASE: "http://localhost:3000",
  FRONTEND_BASE: "http://localhost:3001",
  UPLOADS_DIR: path.join(__dirname, "../../../uploads"),
  TEST_FILES_DIR: path.join(__dirname, "../../../test-files"),
};

// Colors for console output
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, description) {
  log(`\n${colors.bold}[STEP ${step}]${colors.reset} ${description}`, "blue");
}

function logSuccess(message) {
  log(`✅ ${message}`, "green");
}

function logError(message) {
  log(`❌ ${message}`, "red");
}

function logWarning(message) {
  log(`⚠️  ${message}`, "yellow");
}

// Test Results Storage
const testResults = {
  passed: 0,
  failed: 0,
  warnings: 0,
  details: [],
};

function recordTest(name, passed, message) {
  testResults.details.push({ name, passed, message });
  if (passed) {
    testResults.passed++;
    logSuccess(`${name}: ${message}`);
  } else {
    testResults.failed++;
    logError(`${name}: ${message}`);
  }
}

function recordWarning(name, message) {
  testResults.warnings++;
  testResults.details.push({ name, passed: null, message });
  logWarning(`${name}: ${message}`);
}

// Create test files
async function createTestFiles() {
  logStep(1, "Creating Test Files");

  try {
    if (!fs.existsSync(CONFIG.TEST_FILES_DIR)) {
      fs.mkdirSync(CONFIG.TEST_FILES_DIR, { recursive: true });
    }

    // Create a sample text file
    const textContent =
      "This is a test document for Noah Media System testing.";
    fs.writeFileSync(
      path.join(CONFIG.TEST_FILES_DIR, "test-document.txt"),
      textContent
    );

    // Create a sample JSON file (simulating a small media file)
    const jsonContent = {
      type: "test",
      filename: "test-media.json",
      description: "Test media file for upload testing",
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(CONFIG.TEST_FILES_DIR, "test-media.json"),
      JSON.stringify(jsonContent, null, 2)
    );

    logSuccess("Test files created successfully");
    return true;
  } catch (error) {
    logError(`Failed to create test files: ${error.message}`);
    return false;
  }
}

// Test server connectivity
async function testServerConnectivity() {
  logStep(2, "Testing Server Connectivity");

  // Test API Server
  try {
    const apiResponse = await fetch(`${CONFIG.API_BASE}/health`);
    if (apiResponse.ok) {
      recordTest("API Server", true, "API server is running and responding");
    } else {
      recordTest(
        "API Server",
        false,
        `API server returned ${apiResponse.status}`
      );
    }
  } catch (error) {
    recordTest(
      "API Server",
      false,
      `API server is not accessible: ${error.message}`
    );
  }

  // Test Frontend Server
  try {
    const frontendResponse = await fetch(CONFIG.FRONTEND_BASE);
    if (frontendResponse.ok) {
      recordTest("Frontend Server", true, "Frontend server is running");
    } else {
      recordTest(
        "Frontend Server",
        false,
        `Frontend server returned ${frontendResponse.status}`
      );
    }
  } catch (error) {
    recordTest(
      "Frontend Server",
      false,
      `Frontend server is not accessible: ${error.message}`
    );
  }
}

// Test uploads directory
async function testUploadsDirectory() {
  logStep(3, "Testing Uploads Directory");

  try {
    if (!fs.existsSync(CONFIG.UPLOADS_DIR)) {
      fs.mkdirSync(CONFIG.UPLOADS_DIR, { recursive: true });
      recordWarning("Uploads Directory", "Directory did not exist, created it");
    } else {
      recordTest("Uploads Directory", true, "Uploads directory exists");
    }

    // Test write permissions
    const testFile = path.join(CONFIG.UPLOADS_DIR, "write-test.tmp");
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
    recordTest("Upload Permissions", true, "Can write to uploads directory");

    // List existing files
    const files = fs.readdirSync(CONFIG.UPLOADS_DIR);
    log(
      `📁 Found ${
        files.length
      } existing files in uploads directory: ${files.join(", ")}`
    );
  } catch (error) {
    recordTest(
      "Uploads Directory",
      false,
      `Cannot access uploads directory: ${error.message}`
    );
  }
}

// Test API endpoints
async function testAPIEndpoints() {
  logStep(4, "Testing API Endpoints");

  // Test GET /api/media
  try {
    const response = await fetch(`${CONFIG.API_BASE}/api/media`);
    const data = await response.json();

    if (response.ok && data.success) {
      recordTest(
        "Media List API",
        true,
        `Retrieved ${data.data.length} media assets`
      );
      log(
        `📋 Current media assets: ${data.data
          .map((item) => item.name)
          .join(", ")}`
      );
    } else {
      recordTest(
        "Media List API",
        false,
        `API returned error: ${data.error || "Unknown error"}`
      );
    }
  } catch (error) {
    recordTest(
      "Media List API",
      false,
      `Failed to fetch media list: ${error.message}`
    );
  }

  // Test file upload
  try {
    const testFilePath = path.join(CONFIG.TEST_FILES_DIR, "test-document.txt");

    if (fs.existsSync(testFilePath)) {
      const fileBuffer = fs.readFileSync(testFilePath);
      const formData = new FormData();
      const blob = new Blob([fileBuffer], { type: "text/plain" });
      formData.append("file", blob, "test-document.txt");

      const uploadResponse = await fetch(
        `${CONFIG.API_BASE}/api/media/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      const uploadResult = await uploadResponse.json();

      if (uploadResponse.ok && uploadResult.success) {
        recordTest(
          "File Upload API",
          true,
          `Successfully uploaded test file: ${uploadResult.data.name}`
        );

        // Verify file was actually saved
        const uploadedFileName = uploadResult.data.url.split("/").pop();
        const uploadedFilePath = path.join(
          CONFIG.UPLOADS_DIR,
          uploadedFileName
        );

        if (fs.existsSync(uploadedFilePath)) {
          recordTest("File Storage", true, "Uploaded file exists on disk");
        } else {
          recordTest("File Storage", false, "Uploaded file not found on disk");
        }
      } else {
        recordTest(
          "File Upload API",
          false,
          `Upload failed: ${uploadResult.error || "Unknown error"}`
        );
      }
    } else {
      recordWarning(
        "File Upload API",
        "Test file not found, skipping upload test"
      );
    }
  } catch (error) {
    recordTest(
      "File Upload API",
      false,
      `Upload test failed: ${error.message}`
    );
  }
}

// Test static file serving
async function testStaticFileServing() {
  logStep(5, "Testing Static File Serving");

  try {
    // Get list of uploaded files
    const files = fs
      .readdirSync(CONFIG.UPLOADS_DIR)
      .filter((f) => !f.startsWith("."));

    if (files.length === 0) {
      recordWarning("Static File Serving", "No uploaded files to test");
      return;
    }

    // Test serving the first file
    const testFile = files[0];
    const fileUrl = `${CONFIG.API_BASE}/uploads/${testFile}`;

    const response = await fetch(fileUrl);

    if (response.ok) {
      recordTest(
        "Static File Serving",
        true,
        `Successfully served file: ${testFile}`
      );
    } else {
      recordTest(
        "Static File Serving",
        false,
        `Failed to serve file: ${response.status}`
      );
    }
  } catch (error) {
    recordTest(
      "Static File Serving",
      false,
      `Static file test failed: ${error.message}`
    );
  }
}

// Test media browser integration
async function testMediaBrowserIntegration() {
  logStep(6, "Testing Media Browser Integration");

  try {
    // Get media list before upload
    const beforeResponse = await fetch(`${CONFIG.API_BASE}/api/media`);
    const beforeData = await beforeResponse.json();
    const beforeCount = beforeData.success ? beforeData.data.length : 0;

    // Upload a new file
    const testFilePath = path.join(CONFIG.TEST_FILES_DIR, "test-media.json");
    if (fs.existsSync(testFilePath)) {
      const fileBuffer = fs.readFileSync(testFilePath);
      const formData = new FormData();
      const blob = new Blob([fileBuffer], { type: "application/json" });
      formData.append("file", blob, "test-media.json");

      const uploadResponse = await fetch(
        `${CONFIG.API_BASE}/api/media/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (uploadResponse.ok) {
        // Check if media list updated
        const afterResponse = await fetch(`${CONFIG.API_BASE}/api/media`);
        const afterData = await afterResponse.json();
        const afterCount = afterData.success ? afterData.data.length : 0;

        if (afterCount > beforeCount) {
          recordTest(
            "Media Browser Sync",
            true,
            `Media list updated: ${beforeCount} → ${afterCount} items`
          );
        } else {
          recordTest(
            "Media Browser Sync",
            false,
            "Media list did not update after upload"
          );
        }
      } else {
        recordWarning("Media Browser Sync", "Upload failed, cannot test sync");
      }
    }
  } catch (error) {
    recordTest(
      "Media Browser Sync",
      false,
      `Integration test failed: ${error.message}`
    );
  }
}

// Test advanced features
async function testAdvancedFeatures() {
  logStep(7, "Testing Advanced Features");

  // Check if MediaPreviewModal dependencies are available
  const packageJsonPath = path.join(__dirname, "../package.json");
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    const requiredPackages = [
      "react-player",
      "react-image-gallery",
      "react-hotkeys-hook",
      "lucide-react",
    ];

    const missingPackages = requiredPackages.filter(
      (pkg) => !dependencies[pkg]
    );

    if (missingPackages.length === 0) {
      recordTest(
        "Advanced Dependencies",
        true,
        "All required packages are installed"
      );
    } else {
      recordTest(
        "Advanced Dependencies",
        false,
        `Missing packages: ${missingPackages.join(", ")}`
      );
    }

    // Check CSS files
    const cssPath = path.join(__dirname, "../src/styles/image-gallery.css");
    if (fs.existsSync(cssPath)) {
      recordTest("CSS Files", true, "Image gallery CSS found");
    } else {
      recordTest("CSS Files", false, "Image gallery CSS missing");
    }
  } catch (error) {
    recordWarning(
      "Advanced Features",
      `Could not check dependencies: ${error.message}`
    );
  }
}

// Test CORS configuration
async function testCORSConfiguration() {
  logStep(8, "Testing CORS Configuration");

  try {
    const response = await fetch(`${CONFIG.API_BASE}/api/media`, {
      method: "OPTIONS",
      headers: {
        Origin: CONFIG.FRONTEND_BASE,
        "Access-Control-Request-Method": "GET",
      },
    });

    const corsHeaders = response.headers.get("access-control-allow-origin");

    if (
      corsHeaders &&
      (corsHeaders === "*" || corsHeaders === CONFIG.FRONTEND_BASE)
    ) {
      recordTest("CORS Configuration", true, "CORS properly configured");
    } else {
      recordTest(
        "CORS Configuration",
        false,
        "CORS may not be properly configured"
      );
    }
  } catch (error) {
    recordWarning(
      "CORS Configuration",
      `Could not test CORS: ${error.message}`
    );
  }
}

// Generate comprehensive test report
function generateTestReport() {
  logStep(9, "Generating Test Report");

  log("\n" + "=".repeat(60), "bold");
  log("NOAH MEDIA SYSTEM - TEST REPORT", "bold");
  log("=".repeat(60), "bold");

  log(`\n📊 SUMMARY:`);
  log(`✅ Tests Passed: ${testResults.passed}`, "green");
  log(`❌ Tests Failed: ${testResults.failed}`, "red");
  log(`⚠️  Warnings: ${testResults.warnings}`, "yellow");
  log(`📋 Total Tests: ${testResults.passed + testResults.failed}`);

  const successRate =
    testResults.passed + testResults.failed > 0
      ? (
          (testResults.passed / (testResults.passed + testResults.failed)) *
          100
        ).toFixed(1)
      : 0;
  log(`📈 Success Rate: ${successRate}%`);

  log(`\n📝 DETAILED RESULTS:`);
  testResults.details.forEach((test) => {
    const status =
      test.passed === true ? "✅" : test.passed === false ? "❌" : "⚠️";
    log(`${status} ${test.name}: ${test.message}`);
  });

  // Recommendations
  log(`\n🔧 RECOMMENDATIONS:`);

  if (testResults.failed > 0) {
    log("❗ CRITICAL ISSUES FOUND - System is not fully functional", "red");

    const failedTests = testResults.details.filter((t) => t.passed === false);
    failedTests.forEach((test) => {
      log(`   • Fix: ${test.name}`, "red");
    });
  }

  if (testResults.warnings > 0) {
    log("⚠️  Minor issues that should be addressed:", "yellow");
    const warnings = testResults.details.filter((t) => t.passed === null);
    warnings.forEach((warning) => {
      log(`   • ${warning.name}`, "yellow");
    });
  }

  if (testResults.failed === 0 && testResults.warnings === 0) {
    log(
      "🎉 ALL SYSTEMS OPERATIONAL - Noah Media System is fully functional!",
      "green"
    );
  }

  log("\n" + "=".repeat(60), "bold");
}

// Main test execution
async function runAllTests() {
  log("🚀 Starting Noah Media System Comprehensive Tests...", "bold");

  try {
    await createTestFiles();
    await testServerConnectivity();
    await testUploadsDirectory();
    await testAPIEndpoints();
    await testStaticFileServing();
    await testMediaBrowserIntegration();
    await testAdvancedFeatures();
    await testCORSConfiguration();

    generateTestReport();
  } catch (error) {
    logError(`Test execution failed: ${error.message}`);
  }
}

// Handle missing node-fetch gracefully
if (typeof fetch === "undefined") {
  console.log("⚠️  node-fetch not available, using simplified testing...");

  // Simplified version without network requests
  async function runSimplifiedTests() {
    logStep(1, "Running Simplified Tests (No Network)");

    await createTestFiles();
    await testUploadsDirectory();
    await testAdvancedFeatures();

    generateTestReport();
  }

  runSimplifiedTests();
} else {
  runAllTests();
}

module.exports = {
  runAllTests,
  testResults,
  CONFIG,
};
