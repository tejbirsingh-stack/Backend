# Noah Platform - Production Deployment Guide
*Last Updated: August 28, 2025*

## 📋 Infrastructure Requirements

### Minimum Production Requirements
- **CPU**: 4 vCPUs (8 recommended)
- **RAM**: 8GB (16GB recommended)
- **Storage**: 100GB SSD (expandable)
- **Bandwidth**: 100 Mbps minimum
- **CDN**: Required for media delivery
- **SSL**: Required for all endpoints

### Service Dependencies
1. **Database**: PostgreSQL 14+ with TimescaleDB
2. **Cache**: Redis 6+ with persistence
3. **Storage**: S3-compatible (AWS S3, MinIO, Backblaze B2)
4. **CDN**: CloudFront, Cloudflare, or Fastly
5. **Email**: SMTP service (SendGrid, AWS SES)
6. **Monitoring**: APM solution (DataDog, New Relic)

## 🚀 Deployment Options

## Option 1: AWS Deployment (Recommended for Scale)

### AWS Services Architecture
```
┌─────────────────────────────────────────────────────────┐
│                     CloudFront CDN                       │
└─────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────┐
│              Application Load Balancer (ALB)             │
└─────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
┌───────────────┐                          ┌───────────────┐
│  ECS Fargate  │                          │  ECS Fargate  │
│   (Web App)   │                          │   (API Server)│
└───────────────┘                          └───────────────┘
        │                                           │
        └─────────────────────┬─────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  RDS Postgres │    │  ElastiCache  │    │   S3 Bucket   │
│  with Multi-AZ│    │    (Redis)    │    │  Media Files  │
└───────────────┘    └───────────────┘    └───────────────┘
```

### Step-by-Step AWS Deployment

#### 1. Prerequisites
```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure AWS credentials
aws configure

# Install required tools
npm install -g aws-cdk
```

#### 2. Infrastructure as Code (AWS CDK)
Create `infrastructure/aws/cdk-stack.ts`:

```typescript
import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';

export class NoahStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC
    const vpc = new ec2.Vpc(this, 'NoahVPC', {
      maxAzs: 2,
      natGateways: 1
    });

    // RDS PostgreSQL
    const database = new rds.DatabaseInstance(this, 'NoahDB', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_14_7,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MEDIUM
      ),
      vpc,
      multiAz: true,
      allocatedStorage: 100,
      storageEncrypted: true,
      databaseName: 'noah',
      credentials: rds.Credentials.fromGeneratedSecret('noah_admin')
    });

    // ElastiCache Redis
    const redis = new elasticache.CfnCacheCluster(this, 'NoahRedis', {
      cacheNodeType: 'cache.t3.micro',
      engine: 'redis',
      numCacheNodes: 1,
      vpcSecurityGroupIds: [securityGroup.securityGroupId]
    });

    // S3 Bucket for media
    const mediaBucket = new s3.Bucket(this, 'NoahMedia', {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      cors: [{
        allowedOrigins: ['*'],
        allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
        allowedHeaders: ['*']
      }]
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, 'NoahCluster', {
      vpc,
      containerInsights: true
    });

    // Task Definitions and Services would go here...
  }
}
```

#### 3. Environment Configuration
Create `.env.production`:

```bash
# Database
DATABASE_URL=postgresql://noah_admin:password@noah-db.cluster-xyz.us-east-1.rds.amazonaws.com:5432/noah

# Redis
REDIS_URL=redis://noah-redis.abc123.ng.0001.use1.cache.amazonaws.com:6379

# S3
AWS_REGION=us-east-1
AWS_S3_BUCKET=noah-media-prod
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# API Configuration
NODE_ENV=production
PORT=4000
API_URL=https://api.noah-platform.com

# Auth
JWT_SECRET=your-secure-jwt-secret-min-32-chars
JWT_REFRESH_SECRET=your-secure-refresh-secret-min-32-chars
SESSION_SECRET=your-secure-session-secret

# Frontend
VITE_API_URL=https://api.noah-platform.com
```

#### 4. Deploy with Docker to ECS

```bash
# Build and push Docker images
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin [your-ecr-uri]

# Build images
docker build -t noah-web ./apps/web
docker build -t noah-api ./apps/api

# Tag and push
docker tag noah-web:latest [ecr-uri]/noah-web:latest
docker tag noah-api:latest [ecr-uri]/noah-api:latest
docker push [ecr-uri]/noah-web:latest
docker push [ecr-uri]/noah-api:latest

# Deploy with CDK
cd infrastructure/aws
npm install
cdk deploy
```

#### 5. Post-Deployment Setup

```bash
# Run database migrations
npm run db:migrate:prod

# Seed initial data (optional)
npm run db:seed:prod

# Verify services
curl https://api.noah-platform.com/health
```

### AWS Cost Estimate (Monthly)
- **ECS Fargate** (2 tasks): ~$50
- **RDS PostgreSQL** (db.t3.medium, Multi-AZ): ~$130
- **ElastiCache Redis** (cache.t3.micro): ~$25
- **S3 Storage** (100GB): ~$3
- **CloudFront CDN** (1TB transfer): ~$85
- **Application Load Balancer**: ~$25
- **Total**: ~$320/month

---

## Option 2: Railway + Vercel Deployment (Recommended - Simple & Scalable)

### Railway + Vercel Architecture  
```
┌─────────────────────────────────────────────────────────┐
│                    Vercel Edge Network                   │
│                   (Frontend - React)                     │
└─────────────────────────────────────────────────────────┘
                              │
                          HTTPS API
                              │
┌─────────────────────────────────────────────────────────┐
│                     Railway Platform                     │
│              (API Server + PostgreSQL DB)                │
└─────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────┐
│                   Backblaze B2 Storage                   │
│                    (Media File Storage)                  │
└─────────────────────────────────────────────────────────┘
```

### Part A: Deploy Backend to Railway

#### Step 1: Create Railway Project
1. Go to [Railway](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your `noah` repository
5. Railway will auto-detect and start initial deployment

#### Step 2: Add PostgreSQL Database
1. In Railway dashboard, click "New" → "Database"
2. Select "Add PostgreSQL"
3. Railway automatically sets `DATABASE_URL` environment variable

#### Step 3: Configure Environment Variables
In Railway dashboard → Variables tab, add:

```env
# JWT Authentication
JWT_SECRET=<generate-secure-32-char-string>
JWT_REFRESH_SECRET=<generate-another-secure-32-char-string>

# B2 Storage Configuration  
B2_KEY_ID=<your-b2-key-id>
B2_APPLICATION_KEY=<your-b2-application-key>
B2_BUCKET_NAME=FullViewNoah
B2_ENDPOINT=https://s3.us-west-001.backblazeb2.com

# App Configuration
NODE_ENV=production
PORT=3000

# Database (auto-configured by Railway)
# DATABASE_URL=<automatically-set-by-railway>
```

#### Step 4: Configure Build & Start Commands
In Railway Settings tab:
- **Root Directory**: `/`
- **Build Command**: `npm install && cd packages/@noah/db && npx prisma generate && npx prisma db push && cd ../../scripts && node create-admin-user.cjs`
- **Start Command**: `cd apps/api && node src/enhanced-media-server.cjs`
- **Watch Paths**: `apps/api/**`, `packages/**`

#### Step 5: Deploy and Get URL
1. Railway will automatically deploy on git push
2. Once deployed, click "Generate Domain" in Settings
3. Note your Railway URL (e.g., `https://noah-api.up.railway.app`)

### Part B: Deploy Frontend to Vercel

#### Step 1: Import Project to Vercel
1. Go to [Vercel](https://vercel.com)
2. Click "Add New" → "Project"  
3. Import your GitHub repository (`noah`)
4. Vercel will detect the configuration

#### Step 2: Configure Build Settings in Vercel
In the import screen, configure:
- **Framework Preset**: Vite
- **Root Directory**: `apps/web`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

#### Step 3: Add Environment Variables
In Vercel Dashboard → Settings → Environment Variables:

```env
VITE_API_URL=https://your-railway-app.up.railway.app
VITE_APP_NAME=Noah Media Library
```

Replace `your-railway-app.up.railway.app` with your Railway URL from Part A.

#### Step 4: Deploy
1. Click "Deploy"
2. Vercel will build and deploy your frontend
3. Get your Vercel URL (e.g., `https://noah-media.vercel.app`)

### Part C: Update CORS Configuration

After both deployments complete:

1. Go back to your code in `apps/api/src/enhanced-media-server.cjs`
2. Find the CORS configuration (around line 45)
3. Update to include your Vercel domain:

```javascript
const corsOrigins = [
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://localhost:3005',
  'http://localhost:5173',
  'https://noah-media.vercel.app',  // Add your Vercel domain
  // Add any custom domains here
];
```

4. Commit and push to GitHub:
```bash
git add .
git commit -m "Add Vercel domain to CORS whitelist"
git push origin master
```

5. Railway will automatically redeploy with the new CORS settings

### Authentication & Users

The deployment creates two default users:
- **Admin**: `admin@visitdetroit.com` / `VisitDetroit2024!`
- **Debug**: `debug@test.com` / `debug123`

### Cost Estimate (Monthly)
- **Railway Hobby Plan**: $5 (includes $5 credits)
- **Railway PostgreSQL**: ~$5-10
- **Vercel Hobby**: Free
- **Backblaze B2**: Pay-as-you-go (~$5/TB storage, $10/TB bandwidth)
- **Total**: ~$15-25/month for starter usage

---

## Option 3: Hybrid Deployment (Best of Both)

### Recommended Architecture
- **Frontend**: Vercel (global edge network)
- **API**: AWS ECS (better for long-running tasks)
- **Database**: AWS RDS (better performance)
- **Media**: CloudFront + S3 (cost-effective)
- **Redis**: AWS ElastiCache (better performance)

### Benefits
- ✅ Best performance
- ✅ Global CDN for frontend
- ✅ Scalable backend
- ✅ Cost-optimized
- ✅ No vendor lock-in

---

## 🔒 Security Checklist

### Pre-Deployment
- [ ] All secrets in environment variables
- [ ] Database passwords rotated
- [ ] SSL certificates configured
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] Input validation implemented
- [ ] SQL injection prevention verified
- [ ] XSS protection enabled
- [ ] CSRF tokens implemented
- [ ] Security headers configured

### Network Security
```nginx
# nginx.conf security headers
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';" always;
```

---

## 📊 Monitoring Setup

### Essential Metrics
1. **Application Metrics**
   - Request rate
   - Error rate
   - Response time
   - Active users

2. **Infrastructure Metrics**
   - CPU usage
   - Memory usage
   - Disk I/O
   - Network throughput

3. **Business Metrics**
   - Upload success rate
   - Video playback starts
   - User registrations
   - Storage usage

### Monitoring Tools

**AWS CloudWatch**:
```javascript
// Custom metrics
const AWS = require('aws-sdk');
const cloudwatch = new AWS.CloudWatch();

cloudwatch.putMetricData({
  Namespace: 'Noah/Application',
  MetricData: [{
    MetricName: 'FileUploads',
    Value: 1,
    Unit: 'Count',
    Timestamp: new Date()
  }]
}).promise();
```

**Vercel Analytics**:
```javascript
// Automatic with Vercel
import { Analytics } from '@vercel/analytics/react';

function App() {
  return (
    <>
      <YourApp />
      <Analytics />
    </>
  );
}
```

---

## 🚦 Load Testing

### Before Going Live
```bash
# Install k6
brew install k6

# Create load test
cat > loadtest.js << 'EOF'
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '5m', target: 100 },
    { duration: '10m', target: 100 },
    { duration: '5m', target: 0 },
  ],
};

export default function () {
  let response = http.get('https://api.noah-platform.com/health');
  check(response, {
    'status is 200': (r) => r.status === 200,
  });
}
EOF

# Run load test
k6 run loadtest.js
```

---

## 📝 Deployment Checklist

### Pre-Deployment
- [ ] Code review completed
- [ ] All tests passing
- [ ] Security audit done
- [ ] Performance tested
- [ ] Backup strategy ready
- [ ] Rollback plan prepared
- [ ] Documentation updated
- [ ] Team notified

### Deployment
- [ ] Database backed up
- [ ] Environment variables set
- [ ] SSL certificates valid
- [ ] DNS configured
- [ ] CDN configured
- [ ] Monitoring enabled
- [ ] Logs aggregated
- [ ] Health checks passing

### Post-Deployment
- [ ] Smoke tests passed
- [ ] Performance metrics normal
- [ ] Error rates acceptable
- [ ] User acceptance tested
- [ ] Backup verified
- [ ] Documentation published
- [ ] Team trained
- [ ] Support ready

---

## 🆘 Troubleshooting

### Common Issues

**Database Connection Failed**:
```bash
# Check connection string
psql $DATABASE_URL -c "SELECT 1"

# Check network connectivity
telnet database-host 5432

# Check credentials
echo $DATABASE_URL | grep -o 'postgresql://[^:]*'
```

**High Memory Usage**:
```javascript
// Add memory monitoring
if (global.gc) {
  global.gc();
}
console.log('Memory Usage:', process.memoryUsage());
```

**Slow API Response**:
```javascript
// Add performance monitoring
console.time('api-request');
// ... your code
console.timeEnd('api-request');
```

---

## 📞 Support Resources

- **AWS Support**: https://aws.amazon.com/support
- **Vercel Support**: https://vercel.com/support
- **Database Issues**: Check connection pooling settings
- **Performance Issues**: Enable CDN and caching
- **Security Concerns**: Run security audit tools

---

*Choose AWS for maximum scalability and control, Vercel for simplicity and speed, or combine both for optimal results. Always test thoroughly before going live.*