const { PrismaClient } = require('@prisma/client');

const globalForPrisma = global;

// Always reuse a single PrismaClient instance across the entire process.
// Appending ?connection_limit=10&pool_timeout=20 caps the connection pool
// so we never exhaust Postgres's max_connections.
if (!globalForPrisma.prisma) {
  const dbUrl = process.env.DATABASE_URL || '';
  const separator = dbUrl.includes('?') ? '&' : '?';
  const pooledUrl = dbUrl
    ? `${dbUrl}${separator}connection_limit=10&pool_timeout=20`
    : dbUrl;

  globalForPrisma.prisma = new PrismaClient({
    datasources: {
      db: { url: pooledUrl || undefined },
    },
  });
}

const prisma = globalForPrisma.prisma;

module.exports = prisma;