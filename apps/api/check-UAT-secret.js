const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

// 1. Configure the AWS Client using environment variables
const client = new SecretsManagerClient({
  region: process.env.AWS_REGION || "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function run() {
  const secretId = process.env.AWS_UAT_SECRET_ID || "noah/uat/app-config-all";

  console.log("==============================================");
  console.log(" AWS Secrets Manager – UAT App Config Check");
  console.log("==============================================");
  console.log(`Secret ID : ${secretId}`);
  console.log(`AWS Region: ${process.env.AWS_REGION || "us-east-2"}`);
  console.log("----------------------------------------------\n");

  try {
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: secretId })
    );

    if (response.SecretString) {
      // Pretty-print every key inside the secret (mask values for safety)
      const parsed = JSON.parse(response.SecretString);
      const keys = Object.keys(parsed);

      console.log(`✅  Secret retrieved successfully!`);
      console.log(`    Total keys found: ${keys.length}\n`);
      console.log("Keys inside the secret:");
      keys.forEach((key) => {
        const preview = String(parsed[key]).slice(0, 6);
        console.log(`  • ${key}: ${preview}...`);
      });

      console.log("\n--- Full Secret String (raw) ---");
      console.log(response.SecretString);
    } else {
      console.log("⚠️  Secret returned binary data (SecretBinary), not a JSON string.");
    }
  } catch (err) {
    console.error(`\n❌  AWS Error [${err.name}]:`, err.message);
    if (err.name === "ResourceNotFoundException") {
      console.error(`    Secret "${secretId}" does not exist in region "${process.env.AWS_REGION}".`);
      console.error("    → Ask DevOps to create the secret or confirm the correct ARN/name.");
    } else if (err.name === "AccessDeniedException") {
      console.error("    The IAM user/role does not have secretsmanager:GetSecretValue permission.");
    }
    process.exit(1);
  }
}

run();
