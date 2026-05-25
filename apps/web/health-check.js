#!/usr/bin/env node

/**
 * Noah Platform - Quick Health Check & Functionality Test
 * This script validates core platform functionality before deployment
 */

import { promises as fs } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class NoahHealthCheck {
  constructor() {
    this.results = {
      webApp: { status: "pending", tests: [] },
      api: { status: "pending", tests: [] },
      components: { status: "pending", tests: [] },
      build: { status: "pending", tests: [] },
    };
  }

  async runAllTests() {
    console.log("🚀 Noah Platform Health Check Started\n");

    try {
      await this.testWebAppStructure();
      await this.testComponentIntegrity();
      await this.testBuildArtifacts();
      await this.generateReport();
    } catch (error) {
      console.error("❌ Health check failed:", error);
      process.exit(1);
    }
  }

  async testWebAppStructure() {
    console.log("📱 Testing Web Application Structure...");

    const requiredFiles = [
      "src/main.tsx",
      "src/App.tsx",
      "src/components/VideoPlayer.tsx",
      "src/components/MediaViewer.tsx",
      "src/components/Sidebar.tsx",
      "src/pages/MediaBrowser.tsx",
      "src/pages/Upload.tsx",
      "src/stores/mediaStore.ts",
      "src/stores/authStore.ts",
      "index.html",
      "package.json",
      "vite.config.ts",
      "tsconfig.json",
    ];

    for (const file of requiredFiles) {
      try {
        await fs.access(join(__dirname, file));
        this.results.webApp.tests.push({ name: file, status: "pass" });
      } catch (error) {
        this.results.webApp.tests.push({
          name: file,
          status: "fail",
          error: "File not found",
        });
      }
    }

    this.results.webApp.status = this.results.webApp.tests.every(
      (t) => t.status === "pass"
    )
      ? "pass"
      : "fail";
    console.log(
      `   ${this.results.webApp.status === "pass" ? "✅" : "❌"} Web app structure check complete\n`
    );
  }

  async testComponentIntegrity() {
    console.log("🎬 Testing Component Integrity...");

    const componentTests = [
      {
        name: "VideoPlayer",
        file: "src/components/VideoPlayer.tsx",
        keywords: ["HTMLVideoElement", "play", "pause", "currentTime"],
      },
      {
        name: "MediaViewer",
        file: "src/components/MediaViewer.tsx",
        keywords: ["MediaAsset", "onClose", "video", "image"],
      },
      {
        name: "MediaBrowser",
        file: "src/pages/MediaBrowser.tsx",
        keywords: ["useMediaStore", "fetchAssets", "grid", "list"],
      },
      {
        name: "MediaStore",
        file: "src/stores/mediaStore.ts",
        keywords: ["uploadFiles", "deleteAssets", "zustand"],
      },
    ];

    for (const test of componentTests) {
      try {
        const content = await fs.readFile(join(__dirname, test.file), "utf-8");
        const hasAllKeywords = test.keywords.every((keyword) =>
          content.includes(keyword)
        );

        this.results.components.tests.push({
          name: test.name,
          status: hasAllKeywords ? "pass" : "fail",
          error: hasAllKeywords ? null : "Missing required keywords",
        });
      } catch (error) {
        this.results.components.tests.push({
          name: test.name,
          status: "fail",
          error: "Component file not readable",
        });
      }
    }

    this.results.components.status = this.results.components.tests.every(
      (t) => t.status === "pass"
    )
      ? "pass"
      : "fail";
    console.log(
      `   ${this.results.components.status === "pass" ? "✅" : "❌"} Component integrity check complete\n`
    );
  }

  async testBuildArtifacts() {
    console.log("🏗️  Testing Build Artifacts...");

    const buildFiles = ["dist/index.html", "dist/assets"];

    for (const file of buildFiles) {
      try {
        await fs.access(join(__dirname, file));
        this.results.build.tests.push({ name: file, status: "pass" });
      } catch (error) {
        this.results.build.tests.push({
          name: file,
          status: "fail",
          error: "Build artifact missing",
        });
      }
    }

    // Check if build artifacts have reasonable sizes
    try {
      const distFiles = await fs.readdir(join(__dirname, "dist/assets"));
      const jsFiles = distFiles.filter((f) => f.endsWith(".js"));
      const cssFiles = distFiles.filter((f) => f.endsWith(".css"));

      this.results.build.tests.push({
        name: "JavaScript bundles",
        status: jsFiles.length > 0 ? "pass" : "fail",
        details: `${jsFiles.length} JS files generated`,
      });

      this.results.build.tests.push({
        name: "CSS bundles",
        status: cssFiles.length > 0 ? "pass" : "fail",
        details: `${cssFiles.length} CSS files generated`,
      });
    } catch (error) {
      this.results.build.tests.push({
        name: "Bundle analysis",
        status: "fail",
        error: "Could not analyze build artifacts",
      });
    }

    this.results.build.status = this.results.build.tests.every(
      (t) => t.status === "pass"
    )
      ? "pass"
      : "fail";
    console.log(
      `   ${this.results.build.status === "pass" ? "✅" : "❌"} Build artifacts check complete\n`
    );
  }

  async generateReport() {
    console.log("📊 NOAH PLATFORM HEALTH REPORT");
    console.log("=".repeat(50));

    const overallStatus = Object.values(this.results).every(
      (r) => r.status === "pass"
    )
      ? "HEALTHY"
      : "ISSUES FOUND";
    console.log(`🏥 Overall Status: ${overallStatus}\n`);

    for (const [category, result] of Object.entries(this.results)) {
      console.log(
        `${result.status === "pass" ? "✅" : "❌"} ${category.toUpperCase()}: ${result.status.toUpperCase()}`
      );

      for (const test of result.tests) {
        const icon = test.status === "pass" ? "  ✓" : "  ✗";
        console.log(
          `${icon} ${test.name}${test.details ? ` (${test.details})` : ""}`
        );
        if (test.error) {
          console.log(`    Error: ${test.error}`);
        }
      }
      console.log("");
    }

    // Summary statistics
    const totalTests = Object.values(this.results).reduce(
      (sum, r) => sum + r.tests.length,
      0
    );
    const passedTests = Object.values(this.results).reduce(
      (sum, r) => sum + r.tests.filter((t) => t.status === "pass").length,
      0
    );

    console.log(
      `📈 Test Summary: ${passedTests}/${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`
    );

    if (overallStatus === "HEALTHY") {
      console.log("\n🚀 Platform is ready for deployment!");
    } else {
      console.log("\n⚠️  Please address the issues above before deployment.");
    }

    // Write detailed report to file
    const reportData = {
      timestamp: new Date().toISOString(),
      status: overallStatus,
      summary: {
        total: totalTests,
        passed: passedTests,
        failed: totalTests - passedTests,
      },
      details: this.results,
    };

    await fs.writeFile(
      join(__dirname, "health-check-report.json"),
      JSON.stringify(reportData, null, 2)
    );

    console.log("\n📄 Detailed report saved to: health-check-report.json");
  }
}

// Run the health check
const healthCheck = new NoahHealthCheck();
healthCheck.runAllTests().catch(console.error);
