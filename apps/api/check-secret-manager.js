'use strict';

// Fix: IPv6 is unreachable on this network — force IPv4 for all DNS lookups.
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require('@aws-sdk/client-secrets-manager');
const { NodeHttpHandler } = require('@smithy/node-http-handler');

async function main() {
  const secretId =
    process.env.AWS_APP_SECRET_ID ||
    process.env.AWS_UAT_SECRET_ID ||
    'noah/uat/app-config-all';
  const region = process.env.AWS_REGION || 'us-east-2';

  console.log('Secret ID:', secretId);
  console.log('Region:', region);
  console.log('AWS_SECRETS_MANAGER_ENABLED:', process.env.AWS_SECRETS_MANAGER_ENABLED);
  console.log('AWS_ACCESS_KEY_ID set:', Boolean(process.env.AWS_ACCESS_KEY_ID));

  const client = new SecretsManagerClient({
    region,
    requestHandler: new NodeHttpHandler({
      httpsAgent: new https.Agent({ family: 4 }),
    }),
  });
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));

  if (!response.SecretString) {
    throw new Error('SecretString is empty');
  }

  const parsed = JSON.parse(response.SecretString);
  const topKeys = Object.keys(parsed);
  console.log('\nTop-level keys:', topKeys);

  console.log('\nFull JSON:\n');
  console.log(JSON.stringify(parsed, null, 2));

}

main().catch((err) => {
  console.error('Failed to fetch secret:');
  console.error('  name:', err.name);
  console.error('  code:', err.Code || err.code);
  console.error('  message:', err.message || '(empty)');
  if (err.$metadata) {
    console.error('  httpStatus:', err.$metadata.httpStatusCode);
    console.error('  requestId:', err.$metadata.requestId);
  }
  if (err.stack) {
    console.error('\n', err.stack);
  }
  process.exit(1);
});
