#!/usr/bin/env node

/**
 * Backblaze B2 Status Checker
 * Verifies B2 configuration and tests connectivity
 */

const { S3Client, ListBucketsCommand, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

console.log('\n' + '='.repeat(60));
console.log('🔍 BACKBLAZE B2 STATUS CHECKER');
console.log('='.repeat(60) + '\n');

// Status tracking
const status = {
  envVars: false,
  connection: false,
  bucketAccess: false,
  writePermission: false,
  readPermission: false,
  deletePermission: false
};

// Check environment variables
console.log('📋 CHECKING ENVIRONMENT VARIABLES\n');

const requiredVars = {
  B2_KEY_ID: process.env.B2_KEY_ID,
  B2_APPLICATION_KEY: process.env.B2_APPLICATION_KEY,
  B2_BUCKET_NAME: process.env.B2_BUCKET_NAME
};

const optionalVars = {
  B2_ENDPOINT: process.env.B2_ENDPOINT || 'https://s3.us-west-002.backblazeb2.com',
  B2_REGION: process.env.B2_REGION || 'us-west-002'
};

// Check required variables
let allRequiredPresent = true;
for (const [key, value] of Object.entries(requiredVars)) {
  if (value) {
    console.log(`✅ ${key}: ${key.includes('KEY') ? '***' + value.slice(-4) : value}`);
  } else {
    console.log(`❌ ${key}: NOT SET`);
    allRequiredPresent = false;
  }
}

// Show optional variables
console.log('\n📋 OPTIONAL VARIABLES\n');
for (const [key, value] of Object.entries(optionalVars)) {
  console.log(`ℹ️  ${key}: ${value}`);
}

status.envVars = allRequiredPresent;

if (!allRequiredPresent) {
  console.log('\n❌ MISSING REQUIRED CONFIGURATION');
  console.log('Please add the following to your .env file:\n');
  console.log('B2_KEY_ID=your_key_id_here');
  console.log('B2_APPLICATION_KEY=your_application_key_here');
  console.log('B2_BUCKET_NAME=your_bucket_name_here\n');
  console.log('See B2_IMPLEMENTATION_PLAN.md for detailed setup instructions.');
  process.exit(1);
}

// Initialize B2 client
console.log('\n' + '='.repeat(60));
console.log('🔌 TESTING B2 CONNECTION\n');

const s3Client = new S3Client({
  region: optionalVars.B2_REGION,
  endpoint: optionalVars.B2_ENDPOINT,
  credentials: {
    accessKeyId: requiredVars.B2_KEY_ID,
    secretAccessKey: requiredVars.B2_APPLICATION_KEY,
  },
  forcePathStyle: true,
});

// Test connection by listing buckets
async function testConnection() {
  try {
    console.log('📡 Testing API connection...');
    const command = new ListBucketsCommand({});
    const response = await s3Client.send(command);
    console.log(`✅ Connected successfully! Found ${response.Buckets?.length || 0} buckets`);
    
    // Check if our bucket exists
    const bucketExists = response.Buckets?.some(b => b.Name === requiredVars.B2_BUCKET_NAME);
    if (bucketExists) {
      console.log(`✅ Bucket '${requiredVars.B2_BUCKET_NAME}' exists`);
    } else {
      console.log(`⚠️  Bucket '${requiredVars.B2_BUCKET_NAME}' not found in account`);
      console.log('Available buckets:', response.Buckets?.map(b => b.Name).join(', '));
    }
    
    status.connection = true;
    status.bucketAccess = bucketExists;
    return true;
  } catch (error) {
    console.log('❌ Connection failed:', error.message);
    if (error.name === 'InvalidAccessKeyId') {
      console.log('   → Check your B2_KEY_ID');
    } else if (error.name === 'SignatureDoesNotMatch') {
      console.log('   → Check your B2_APPLICATION_KEY');
    } else if (error.name === 'NetworkingError') {
      console.log('   → Check your internet connection and B2_ENDPOINT');
    }
    return false;
  }
}

// Test bucket operations
async function testBucketOperations() {
  if (!status.bucketAccess) {
    console.log('\n⏭️  Skipping bucket operations (bucket not accessible)');
    return;
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🧪 TESTING BUCKET OPERATIONS\n');
  
  const testFileName = `test-${Date.now()}.txt`;
  const testContent = `B2 test file created at ${new Date().toISOString()}`;
  
  // Test 1: List objects
  try {
    console.log('📋 Testing LIST permission...');
    const listCommand = new ListObjectsV2Command({
      Bucket: requiredVars.B2_BUCKET_NAME,
      MaxKeys: 10
    });
    const listResponse = await s3Client.send(listCommand);
    console.log(`✅ LIST works! Found ${listResponse.Contents?.length || 0} objects`);
    status.readPermission = true;
  } catch (error) {
    console.log('❌ LIST failed:', error.message);
  }
  
  // Test 2: Upload object
  try {
    console.log('\n📤 Testing WRITE permission...');
    const putCommand = new PutObjectCommand({
      Bucket: requiredVars.B2_BUCKET_NAME,
      Key: testFileName,
      Body: testContent,
      ContentType: 'text/plain'
    });
    await s3Client.send(putCommand);
    console.log(`✅ WRITE works! Uploaded test file: ${testFileName}`);
    status.writePermission = true;
    
    // Test 3: Delete object
    try {
      console.log('\n🗑️  Testing DELETE permission...');
      const deleteCommand = new DeleteObjectCommand({
        Bucket: requiredVars.B2_BUCKET_NAME,
        Key: testFileName
      });
      await s3Client.send(deleteCommand);
      console.log(`✅ DELETE works! Removed test file: ${testFileName}`);
      status.deletePermission = true;
    } catch (error) {
      console.log('❌ DELETE failed:', error.message);
      console.log(`   → Test file '${testFileName}' may still exist in bucket`);
    }
    
  } catch (error) {
    console.log('❌ WRITE failed:', error.message);
    if (error.name === 'AccessDenied') {
      console.log('   → Check if your Application Key has write permissions');
    }
  }
}

// Test media server integration
async function testMediaServerIntegration() {
  console.log('\n' + '='.repeat(60));
  console.log('🖥️  MEDIA SERVER INTEGRATION\n');
  
  // Check if server is running
  try {
    const response = await fetch('http://localhost:3000/api/storage/status');
    const data = await response.json();
    
    if (data.b2?.enabled) {
      console.log('✅ B2 is ENABLED in media server');
      console.log(`   Bucket: ${data.b2.bucket}`);
      console.log(`   Endpoint: ${data.b2.endpoint}`);
    } else {
      console.log('⚠️  B2 is DISABLED in media server');
      console.log('   → Restart the server after configuring .env');
    }
  } catch (error) {
    console.log('ℹ️  Media server not running or not accessible');
    console.log('   → Start with: cd apps/api && PORT=3000 node src/enhanced-media-server.cjs');
  }
}

// Generate summary report
function generateReport() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY REPORT\n');
  
  const checks = [
    { name: 'Environment Variables', status: status.envVars },
    { name: 'B2 API Connection', status: status.connection },
    { name: 'Bucket Access', status: status.bucketAccess },
    { name: 'Read Permission', status: status.readPermission },
    { name: 'Write Permission', status: status.writePermission },
    { name: 'Delete Permission', status: status.deletePermission }
  ];
  
  checks.forEach(check => {
    console.log(`${check.status ? '✅' : '❌'} ${check.name}`);
  });
  
  const passedChecks = checks.filter(c => c.status).length;
  const totalChecks = checks.length;
  
  console.log(`\n📈 Score: ${passedChecks}/${totalChecks} checks passed`);
  
  if (passedChecks === totalChecks) {
    console.log('\n🎉 SUCCESS! B2 is fully configured and working!');
    console.log('Next steps:');
    console.log('1. Restart the media server to enable B2');
    console.log('2. Test file uploads through the web interface');
    console.log('3. Monitor the B2 console for activity');
  } else if (passedChecks > 0) {
    console.log('\n⚠️  PARTIAL SUCCESS - Some features may not work');
    console.log('Check the failed items above and fix configuration');
  } else {
    console.log('\n❌ CONFIGURATION NEEDED');
    console.log('Follow the setup instructions in B2_IMPLEMENTATION_PLAN.md');
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
}

// Run all tests
async function runTests() {
  const connected = await testConnection();
  
  if (connected) {
    await testBucketOperations();
  }
  
  await testMediaServerIntegration();
  generateReport();
}

// Execute
runTests().catch(error => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});