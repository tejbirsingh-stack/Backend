// Simple Fastify API for testing
const fastify = require("fastify")({
  logger: true,
  // Handle BigInt serialization
  ajv: {
    plugins: [require("ajv-formats")],
  },
});

// Enable CORS
fastify.register(require("@fastify/cors"), {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

// Custom JSON serializer to handle BigInt
fastify.addHook("preSerialization", (request, reply, payload, done) => {
  const serialized = JSON.stringify(payload, (_, value) =>
    typeof value === "bigint" ? value.toString() : value
  );
  done(null, JSON.parse(serialized));
});

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

// Health check route
fastify.get("/health", async (request, reply) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    return {
      status: "healthy",
      database: "connected",
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    reply.code(503);
    return {
      status: "unhealthy",
      database: "disconnected",
      error: err.message,
      timestamp: new Date().toISOString(),
    };
  }
});

// API Routes
fastify.get("/api/organizations", async (request, reply) => {
  try {
    const organizations = await prisma.organization.findMany({
      take: 10,
      include: {
        users: true,
      },
    });

    return organizations;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
});

fastify.get("/api/users", async (request, reply) => {
  try {
    const users = await prisma.user.findMany({
      take: 10,
    });

    return users;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
});

fastify.get("/api/media", async (request, reply) => {
  try {
    const mediaAssets = await prisma.mediaAsset.findMany({
      take: 10,
      include: {
        assetTags: {
          include: {
            tag: true,
          },
        },
        collectionAssets: {
          include: {
            collection: true,
          },
        },
      },
    });

    return mediaAssets;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
});

// Register media routes
fastify.register(require('./routes/media-routes'), { prefix: '/api' });

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: "0.0.0.0" });
    console.log(`Server is running at http://localhost:3000`);
    console.log(`API endpoints available at http://localhost:3000/api`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
