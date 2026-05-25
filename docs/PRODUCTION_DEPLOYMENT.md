# Noah Platform Production Deployment

This guide explains how to deploy the Noah Platform in a production environment using Docker Compose.

## Prerequisites

- Docker and Docker Compose installed on your production server
- Sufficient server resources (recommend at least 16GB RAM, 8 CPUs)
- Domain name configured for your services
- SSL certificates for your domains

## Setup Instructions

### 1. Prepare the Environment

1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/noah.git
   cd noah
   ```

2. Create your production environment file:
   ```bash
   cp .env.production.example .env.production
   ```

3. Edit the `.env.production` file with your secure credentials:
   ```bash
   nano .env.production
   ```

### 2. Configure SSL (Optional but Recommended)

For a production deployment, it's highly recommended to use SSL. You can use Let's Encrypt to generate certificates:

1. Install certbot on your server
2. Generate certificates for your domain(s)
3. Configure the certificates in your reverse proxy (like Nginx or Traefik)

### 3. Start the Services

```bash
docker-compose -f docker-compose.production.yml --env-file .env.production up -d
```

This will start all services in detached mode.

### 4. Verify the Deployment

1. Check if all services are running:
   ```bash
   docker-compose -f docker-compose.production.yml ps
   ```

2. Check service logs if needed:
   ```bash
   docker-compose -f docker-compose.production.yml logs -f [service_name]
   ```

3. Test the API health endpoint:
   ```bash
   curl http://localhost:3001/health
   ```

### 5. Configure API Gateway (Kong)

1. Kong should automatically initialize with the database
2. Set up API routes as needed:
   ```bash
   curl -i -X POST http://localhost:8001/services \
     --data name=api \
     --data url=http://api:3001

   curl -i -X POST http://localhost:8001/services/api/routes \
     --data 'paths[]=/api' \
     --data name=api-route
   ```

### 6. Security Considerations

- Change all default passwords in the `.env.production` file
- Configure proper firewalls to restrict access to internal services
- Set up regular database backups
- Enable monitoring and alerting

### 7. Scaling (For Future Growth)

This setup can be scaled by:

1. Increasing resource limits in the docker-compose file
2. Adding more replicas of stateless services
3. Setting up proper load balancing
4. Implementing database sharding if needed

## Troubleshooting

If you encounter issues:

1. Check service logs for errors:
   ```bash
   docker-compose -f docker-compose.production.yml logs -f [service_name]
   ```

2. Verify all environment variables are set correctly
3. Check network connectivity between services
4. Ensure database migrations have been applied

## Maintenance

- Schedule regular backups of volumes
- Monitor disk space and resource usage
- Keep services updated with security patches
- Plan for periodic downtime for major upgrades
