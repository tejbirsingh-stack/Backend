// Simple Media API Server for testing uploads
const fastify = require("fastify")({
  logger: true,
});

// Enable CORS
fastify.register(require("@fastify/cors"), {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

// Register multipart support for file uploads
fastify.register(require("@fastify/multipart"), {
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit
  },
});

// Register static file serving for uploads
fastify.register(require("@fastify/static"), {
  root: require("path").join(__dirname, "../../../uploads"),
  prefix: "/uploads/",
});

// Health check route
fastify.get("/health", async (request, reply) => {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "Noah Media API",
  };
});

// Register media routes
fastify.register(require("./routes/media-routes"), { prefix: "/api" });

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: "0.0.0.0" });
    console.log(`🚀 Noah Media API Server is running at http://localhost:3000`);
    console.log(`📁 API endpoints available at http://localhost:3000/api`);
    console.log(`🏥 Health check: http://localhost:3000/health`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
