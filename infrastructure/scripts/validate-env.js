#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REQUIRED_ENV_VARS = {
  common: [
    "NODE_ENV",
    "LOG_LEVEL",
    // 'SENTRY_DSN', // Optional for local dev
    // 'DD_API_KEY' // Optional for local dev
  ],
  api: [
    "DATABASE_URL",
    "REDIS_URL",
    "JWT_SECRET",
    // 'JWT_PUBLIC_KEY', // Only needed if using RS256 and loading from file
    // 'JWT_PRIVATE_KEY',// Only needed if using RS256 and loading from file
    "SESSION_SECRET",
    "ENCRYPTION_KEY",
    "B2_APPLICATION_KEY_ID",
    "B2_APPLICATION_KEY",
    "KAFKA_BROKERS",
    // 'SMTP_HOST', // Optional
    // 'SMTP_PORT', // Optional
    // 'SMTP_USER', // Optional
    // 'SMTP_PASSWORD' // Optional
  ],
  web: [
    "NEXT_PUBLIC_API_URL",
    // 'NEXT_PUBLIC_WS_URL', // If you implement WebSockets
    // 'NEXT_PUBLIC_SENTRY_DSN', // Optional
    // 'NEXT_PUBLIC_GA_ID' // Optional
  ],
  storage: [
    // Add for your storage service
    "B2_APPLICATION_KEY_ID",
    "B2_APPLICATION_KEY",
    "REDIS_HOST",
  ],
  compression: [
    // Add for your compression service
    "KAFKA_BROKERS",
    "B2_APPLICATION_KEY_ID",
    "B2_APPLICATION_KEY",
    // Add paths to FFmpeg, etc.
  ],
  "ai-service": [
    // Add for your AI service
    "KAFKA_BROKERS",
    "B2_APPLICATION_KEY_ID", // If AI service directly accesses B2
    "B2_APPLICATION_KEY",
    // Add cloud AI API keys
  ],
  search: [
    // Add for your search service
    "ELASTICSEARCH_URL",
    "REDIS_HOST",
    "KAFKA_BROKERS",
  ],
};

const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /key/i,
  /token/i,
  /credential/i,
];

class EnvValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  validateEnvFile(filePath, requiredVars) {
    if (!fs.existsSync(filePath)) {
      this.errors.push(`Environment file not found: ${filePath}`);
      return;
    }

    const envContent = fs.readFileSync(filePath, "utf8");
    const envVars = this.parseEnvFile(envContent);

    // Check required variables
    for (const varName of requiredVars) {
      if (!envVars[varName]) {
        this.errors.push(
          `Missing required variable: ${varName} in ${filePath}`
        );
      }
    }

    // Validate variable values
    this.validateValues(envVars);
    // Check for security issues
    this.checkSecurity(envVars);
  }

  parseEnvFile(content) {
    const vars = {};
    const lines = content.split("\n");

    for (const line of lines) {
      if (line.trim() && !line.startsWith("#")) {
        const [key, ...valueParts] = line.split("=");
        vars[key.trim()] = valueParts
          .join("=")
          .trim()
          .replace(/^["']|["']$/g, "");
      }
    }
    return vars;
  }

  validateValues(envVars) {
    // Validate URLs
    const urlVars = [
      "DATABASE_URL",
      "REDIS_URL",
      "NEXT_PUBLIC_API_URL",
      "ELASTICSEARCH_URL",
    ];
    for (const varName of urlVars) {
      if (envVars[varName]) {
        try {
          new URL(envVars[varName]);
        } catch (e) {
          this.errors.push(`Invalid URL for ${varName}: ${envVars[varName]}`);
        }
      }
    }

    // Validate ports
    const portVars = ["PORT", "SMTP_PORT"];
    for (const varName of portVars) {
      if (envVars[varName]) {
        const port = parseInt(envVars[varName], 10);
        if (isNaN(port) || port < 1 || port > 65535) {
          this.errors.push(`Invalid port for ${varName}: ${envVars[varName]}`);
        }
      }
    }

    // Validate boolean values
    const boolVars = ["HTTPS_ENABLED", "DEBUG"];
    for (const varName of boolVars) {
      if (
        envVars[varName] &&
        !["true", "false", "1", "0"].includes(envVars[varName])
      ) {
        this.warnings.push(
          `Invalid boolean value for ${varName}: ${envVars[varName]}`
        );
      }
    }
  }

  checkSecurity(envVars) {
    // Check for hardcoded sensitive values
    for (const [key, value] of Object.entries(envVars)) {
      if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(key))) {
        if (typeof value === "string" && value.length < 32) {
          this.warnings.push(`Weak value for ${key} (less than 32 characters)`);
        }

        if (
          typeof value === "string" &&
          (value.includes("example") ||
            value.includes("changeme") ||
            value.includes("password"))
        ) {
          this.errors.push(`Insecure placeholder value for ${key}`);
        }
      }
    }

    // Check JWT keys
    if (envVars.JWT_SECRET && envVars.JWT_SECRET.length < 256 / 8) {
      // 256 bits = 32 bytes
      this.errors.push(
        "JWT_SECRET should be at least 32 characters (256 bits)"
      );
    }

    // Check encryption key
    if (envVars.ENCRYPTION_KEY) {
      try {
        const keyBuffer = Buffer.from(envVars.ENCRYPTION_KEY, "base64");
        if (keyBuffer.length !== 32) {
          this.errors.push(
            "ENCRYPTION_KEY must be exactly 32 bytes (256 bits) Base64 encoded"
          );
        }
      } catch (e) {
        this.errors.push("ENCRYPTION_KEY is not valid Base64 or wrong length");
      }
    }

    // Validate NODE_ENV
    if (
      envVars.NODE_ENV &&
      !["development", "test", "staging", "production"].includes(
        envVars.NODE_ENV
      )
    ) {
      this.warnings.push(`Unusual NODE_ENV value: ${envVars.NODE_ENV}`);
    }
  }

  generateSecureValues() {
    console.log(
      "\nGenerated secure values for missing secrets (add these to your .env file):"
    );
    console.log("JWT_SECRET=" + crypto.randomBytes(32).toString("base64url")); // Using base64url for safer URL/FS use
    console.log(
      "SESSION_SECRET=" + crypto.randomBytes(32).toString("base64url")
    );
    console.log("ENCRYPTION_KEY=" + crypto.randomBytes(32).toString("base64")); // Base64 for 32-byte key
  }

  run() {
    console.log("🔍 Validating environment configuration...\n");
    // Check .env.example exists in root
    if (!fs.existsSync(path.join(process.cwd(), ".env.example"))) {
      this.warnings.push(
        "Missing .env.example file in the root. Consider creating one for documentation."
      );
    }

    // Validate root .env
    this.validateEnvFile(
      path.join(process.cwd(), ".env"),
      REQUIRED_ENV_VARS.common
    );

    // Validate based on common app env patterns (e.g., apps/*/env.local)
    const appDirs = fs
      .readdirSync(path.join(process.cwd(), "apps"), { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    for (const appName of appDirs) {
      const appEnvPath = path.join(
        process.cwd(),
        "apps",
        appName,
        ".env.local"
      );
      const requiredAppVars = [
        ...(REQUIRED_ENV_VARS.common || []),
        ...(REQUIRED_ENV_VARS[appName] || []),
      ];
      if (fs.existsSync(appEnvPath)) {
        this.validateEnvFile(appEnvPath, requiredAppVars);
      } else {
        this.warnings.push(
          `Missing .env.local file for app: ${appName} at ${appEnvPath}`
        );
      }
    }

    // Report results
    if (this.errors.length > 0) {
      console.error("❌ Environment validation failed:\n");
      this.errors.forEach((error) => console.error(`  - ${error}`));

      if (this.warnings.length > 0) {
        console.warn("\n⚠️  Warnings:\n");
        this.warnings.forEach((warning) => console.warn(`  - ${warning}`));
      }

      console.log("");
      this.generateSecureValues();
      process.exit(1);
    } else if (this.warnings.length > 0) {
      console.warn("⚠️  Environment validation passed with warnings:\n");
      this.warnings.forEach((warning) => console.warn(`  - ${warning}`));
      console.log("\n✅ Proceeding with caution...");
    } else {
      console.log("✅ Environment validation passed!");
    }
  }
}

// Run validator
if (require.main === module) {
  // Only run if script is executed directly
  new EnvValidator().run();
}
