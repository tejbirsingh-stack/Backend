# Noah Platform - Deployment Checklist

*Last Updated: August 21, 2025*

## 🚨 IMMEDIATE DEPLOYMENT - Railway Morning Demo

### Critical Status
- **Video Controls Issue**: Not showing in main app, works in test page `/video-player-test`
- **Database**: Needs migration and Visit Detroit seed data
- **Railway**: Configuration ready, needs environment variables

### Quick Deploy Steps for Demo

#### 1. Database Setup (Local First)
```bash
# Generate Prisma client
cd packages/@noah/db
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed Visit Detroit data
npx tsx prisma/seed-visit-detroit.ts
```

#### 2. Test Locally
```bash
# Start API
cd apps/api
npm run dev:simple

# Start Web (in new terminal)
cd apps/web
npm run dev

# Test accounts:
# admin@visitdetroit.com / VisitDetroit2025!
# john.smith@visitdetroit.com / Detroit2025!
```

#### 3. Railway Deployment
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and init
railway login
railway init

# Deploy
git add .
git commit -m "Ready for Railway deployment"
git push origin main
```

#### 4. Railway Environment Variables
Set in Railway dashboard:
```
DATABASE_URL=postgresql://...
JWT_SECRET=<generate-secure-string>
NODE_ENV=production
PORT=<railway-provides>
VITE_API_URL=https://<your-railway-url>
```

### Demo Fallback Plan
If main app video controls don't work:
1. Direct users to `/video-player-test` page
2. Use test page for video demonstration
3. Explain it's an isolated test environment

## 📋 Full Pre-Deployment Checklist

### Code Quality
- [ ] All tests passing (`npm test`)
- [ ] No console.log statements in production code
- [ ] No hardcoded secrets or API keys
- [ ] Code reviewed and approved
- [ ] Version bumped in package.json
- [ ] CHANGELOG.md updated

### Security Audit
- [ ] Run `npm audit` - no high/critical vulnerabilities
- [ ] All dependencies up to date
- [ ] Environment variables properly configured
- [ ] CORS settings restrictive
- [ ] Rate limiting configured
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention verified
- [ ] XSS protection enabled
- [ ] CSRF tokens implemented
- [ ] File upload restrictions in place

### Database
- [ ] Production database created
- [ ] Connection string tested
- [ ] Migrations ready (`npm run db:migrate:prod`)
- [ ] Backup strategy documented
- [ ] Indexes created for performance
- [ ] Connection pooling configured

### Infrastructure
- [ ] Domain name configured
- [ ] SSL certificates obtained
- [ ] DNS records configured
- [ ] CDN configured
- [ ] Load balancer configured (if applicable)
- [ ] Auto-scaling configured (if applicable)
- [ ] Health check endpoints working

### Storage
- [ ] S3/MinIO bucket created
- [ ] CORS policy configured on bucket
- [ ] Lifecycle policies set (archival/deletion)
- [ ] Backup bucket configured
- [ ] CDN configured for media delivery

### Monitoring
- [ ] Error tracking configured (Sentry/Rollbar)
- [ ] APM configured (DataDog/New Relic)
- [ ] Uptime monitoring configured
- [ ] Log aggregation configured
- [ ] Alerts configured for critical metrics
- [ ] Custom metrics defined

### Documentation
- [ ] API documentation updated
- [ ] Deployment guide reviewed
- [ ] Environment variables documented
- [ ] Runbook created for operations
- [ ] Recovery procedures documented

## 🚀 Deployment Steps

### 1. Final Testing
```bash
# Run full test suite
npm run test:all

# Run security audit
npm audit

# Check for outdated packages
npm outdated

# Build production bundle
npm run build

# Test production build locally
NODE_ENV=production npm start
```

### 2. Database Setup
```bash
# Create production database
createdb noah_production

# Run migrations
DATABASE_URL=prod_connection_string npm run db:migrate:prod

# Verify database
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
```

### 3. Environment Configuration
```bash
# Copy production env template
cp .env.production .env.production.local

# Edit with production values
nano .env.production.local

# Verify all required variables are set
node scripts/verify-env.js
```

### 4. Deploy Application

#### For AWS:
```bash
# Build Docker images
docker build -t noah-web:latest ./apps/web
docker build -t noah-api:latest ./apps/api

# Push to ECR
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URI
docker tag noah-web:latest $ECR_URI/noah-web:latest
docker push $ECR_URI/noah-web:latest

# Update ECS service
aws ecs update-service --cluster noah-cluster --service noah-web --force-new-deployment
```

#### For Vercel:
```bash
# Deploy to production
vercel --prod

# Set environment variables
vercel env add DATABASE_URL production
vercel env add JWT_SECRET production
# ... add all other variables
```

#### For VPS:
```bash
# SSH to server
ssh user@your-server

# Pull latest code
cd /opt/noah
git pull origin main

# Install dependencies
npm ci --production

# Build application
npm run build

# Restart services
pm2 restart all
```

### 5. Post-Deployment Verification

#### Health Checks
```bash
# Check API health
curl https://api.your-domain.com/health

# Check web app
curl https://your-domain.com

# Check database connection
curl https://api.your-domain.com/api/health/db

# Check Redis connection
curl https://api.your-domain.com/api/health/redis
```

#### Functional Tests
- [ ] User registration works
- [ ] User login works
- [ ] File upload works
- [ ] Video playback works
- [ ] Search functionality works
- [ ] Pagination works
- [ ] Real-time features work (if applicable)

#### Performance Tests
```bash
# Basic load test
ab -n 1000 -c 10 https://api.your-domain.com/api/health

# Check response times
curl -w "@curl-format.txt" -o /dev/null -s https://your-domain.com
```

## 📊 Monitoring Checklist

### Immediate (First Hour)
- [ ] All services running
- [ ] No error spikes
- [ ] Response times normal
- [ ] Database connections stable
- [ ] Memory usage stable
- [ ] CPU usage normal

### First 24 Hours
- [ ] No memory leaks
- [ ] Log files rotating properly
- [ ] Backup completed successfully
- [ ] No security alerts
- [ ] CDN cache hit rate good
- [ ] User feedback positive

### First Week
- [ ] Performance metrics stable
- [ ] Error rate < 1%
- [ ] Uptime > 99.9%
- [ ] Database queries optimized
- [ ] Cost within budget
- [ ] Scaling working as expected

## 🔄 Rollback Plan

### If Issues Occur:
1. **Immediate Response**
   ```bash
   # Revert to previous version
   git checkout previous-tag
   npm run deploy:emergency
   ```

2. **Database Rollback**
   ```bash
   # Restore from backup
   pg_restore -d noah_production backup.sql
   ```

3. **DNS Failover**
   - Switch to maintenance page
   - Update DNS to backup server
   - Investigate and fix issues

## 📝 Sign-Off

### Deployment Approved By:
- [ ] Development Team Lead: _____________ Date: _______
- [ ] QA Lead: _____________ Date: _______
- [ ] Security Team: _____________ Date: _______
- [ ] DevOps: _____________ Date: _______
- [ ] Product Owner: _____________ Date: _______

### Post-Deployment Review:
- [ ] Deployment successful
- [ ] All checks passed
- [ ] Monitoring active
- [ ] Team notified
- [ ] Documentation updated

## 🆘 Emergency Contacts

| Role | Name | Contact | Availability |
|------|------|---------|--------------|
| DevOps Lead | - | - | 24/7 |
| Backend Lead | - | - | Business hours |
| Frontend Lead | - | - | Business hours |
| Database Admin | - | - | On-call |
| Security | - | - | On-call |

## 📞 Escalation Path

1. **Level 1**: On-call engineer (0-15 mins)
2. **Level 2**: Team lead (15-30 mins)
3. **Level 3**: CTO/Director (30-60 mins)
4. **Level 4**: Executive team (60+ mins)

## 🔐 Access Requirements

Ensure you have access to:
- [ ] Production AWS/Cloud account
- [ ] Production database
- [ ] Monitoring dashboards
- [ ] Error tracking system
- [ ] DNS management
- [ ] SSL certificate management
- [ ] Backup systems
- [ ] Communication channels (Slack/Discord)

---

*Remember: Always deploy during low-traffic periods, have a rollback plan ready, and communicate with the team throughout the process.*