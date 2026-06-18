// Health Check Controller 
module.exports.checkHealth = async (request, reply) =>{
     // Check database connection
    let dbStatus = "ok";
    try {
      await request.server.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      request.log.error("Database health check failed", error);
      dbStatus = "error";
    }

    // Check Redis connection
    let redisStatus = "ok";
    try {
      await request.server.redis.ping();
    } catch (error) {
      request.log.error("Redis health check failed", error);
      redisStatus = "error";
    }

    // Check auth service
    let authStatus = "ok";
    try {
      const result = await request.server.authService.healthCheck();
      if (!result) {
        authStatus = "error";
      }
    } catch (error) {
      request.log.error("Auth service health check failed", error);
      authStatus = "error";
    }

    // Overall status
    const status =
      dbStatus === "ok" && redisStatus === "ok" && authStatus === "ok"
        ? "healthy"
        : "unhealthy";

    return {
      status,
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        redis: redisStatus,
        auth: authStatus,
      },
      version: process.env.VERSION || "1.0.0",
      environment: process.env.NODE_ENV,
    };
}