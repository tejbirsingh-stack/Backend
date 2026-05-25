export class HealthChecker {
  async check({ database, redis }) {
    const health = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        api: { status: "healthy" },
        database: { status: "unknown" },
        redis: { status: "unknown" },
      },
    };

    // Check database
    try {
      await database.$queryRaw`SELECT 1`;
      health.services.database.status = "healthy";
    } catch (error) {
      health.services.database.status = "unhealthy";
      health.services.database.error = error.message;
      health.status = "degraded";
    }

    // Check Redis
    try {
      const ping = await redis.ping();
      health.services.redis.status = ping === "PONG" ? "healthy" : "degraded";
    } catch (error) {
      health.services.redis.status = "unhealthy";
      health.services.redis.error = error.message;
      health.status = "degraded";
    }

    // If any service is unhealthy, the overall status is unhealthy
    const hasUnhealthy = Object.values(health.services).some(
      (service) => service.status === "unhealthy"
    );

    if (hasUnhealthy) {
      health.status = "unhealthy";
    }

    return health;
  }
}
