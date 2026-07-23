#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// 1. Parse .env file manually
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const parts = trimmed.split('=');
      const key = parts[0].trim();
      let value = parts.slice(1).join('=').trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  });
}

// 2. Load pg
let Client;
try {
  Client = require('pg').Client;
} catch (e) {
  try {
    Client = require(path.join(__dirname, '../packages/@noah/db/node_modules/pg')).Client;
  } catch (e2) {
    console.error('Error: Could not load "pg" library.');
    process.exit(1);
  }
}

const connectionString = process.env.DATABASE_URL || 'postgresql://noah_user:noah_dev_password@localhost:5432/noah_dev';

// Get query from args
const args = process.argv.slice(2);
const isJson = args.includes('--json');
const sqlQuery = args.filter(arg => arg !== '--json').join(' ').trim();

if (!sqlQuery) {
  console.log('Usage: node scripts/query-db.cjs "<SQL query>" [--json]');
  process.exit(0);
}

// Basic pre-validation to prevent obvious write operations before hitting db
const upperQuery = sqlQuery.toUpperCase();
const containsWriteKeyword = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'GRANT', 'REVOKE', 'TRUNCATE'].some(keyword => {
  const regex = new RegExp(`\\b${keyword}\\b`);
  return regex.test(upperQuery);
});

if (containsWriteKeyword) {
  console.error('Error: Write/DDL/DCL keywords are not allowed in read-only queries.');
  process.exit(1);
}

async function run() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    
    // Enforce read-only transaction at Postgres level
    await client.query('BEGIN');
    await client.query('SET TRANSACTION READ ONLY');
    
    const result = await client.query(sqlQuery);
    
    await client.query('COMMIT');
    
    if (isJson) {
      console.log(JSON.stringify(result.rows, null, 2));
    } else {
      formatMarkdownTable(result.rows);
    }
  } catch (error) {
    console.error('Query execution failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

function formatMarkdownTable(rows) {
  if (!rows || rows.length === 0) {
    console.log('No rows returned.');
    return;
  }
  
  const headers = Object.keys(rows[0]);
  
  // Format header row
  const headerLine = '| ' + headers.join(' | ') + ' |';
  const separatorLine = '| ' + headers.map(() => '---').join(' | ') + ' |';
  
  console.log(headerLine);
  console.log(separatorLine);
  
  rows.forEach(row => {
    const rowValues = headers.map(header => {
      const val = row[header];
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val).replace(/\|/g, '\\|'); // Escape pipes inside values
    });
    console.log('| ' + rowValues.join(' | ') + ' |');
  });
}

run();
