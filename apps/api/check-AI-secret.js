const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

// 1. Configure the AWS Client using environment variables
const client = new SecretsManagerClient({ 
  region: process.env.AWS_REGION || "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

async function run() {
  try {
    console.log("Checking AWS Secrets Manager...");
    
    // 2. Request the specific secret by its ID
    const response = await client.send(
      new GetSecretValueCommand({
        SecretId: process.env.AWS_AI_SECRET_ID || "noah/qa/ai/credentials",
      })
    );
    
    // 3. Print the JSON string containing all the keys inside it
    console.log("\n✅ Secret found! Contents:");
    console.log(response.SecretString);
    
  } catch (err) {
    console.error("\n❌ AWS Error:", err.name);
    console.error(err.message);
  }
}

run();
