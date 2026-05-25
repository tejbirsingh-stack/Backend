# Noah Platform - Quick Deployment Guide
*Get Noah running in production in under 30 minutes*

## 🚀 Fastest Path to Production

## Option A: Deploy to Vercel (15 minutes)

### Prerequisites
- GitHub account
- Vercel account (free tier works)
- Supabase account (free tier works)

### Step 1: Fork and Clone
```bash
# Fork the repo on GitHub, then:
git clone https://github.com/YOUR_USERNAME/noah.git
cd noah
npm install
```

### Step 2: Set Up Database (Supabase)
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for database to provision (~2 minutes)
3. Go to Settings → Database
4. Copy the connection string

### Step 3: Set Up Environment
Create `.env.production.local`:
```bash
# Database (from Supabase)
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT].supabase.co:5432/postgres"

# Auth (generate secure secrets)
JWT_SECRET="your-super-secure-jwt-secret-at-least-32-characters"
NEXTAUTH_SECRET="your-super-secure-nextauth-secret"

# App
NEXT_PUBLIC_APP_URL="https://your-app-name.vercel.app"
```

### Step 4: Deploy to Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Follow prompts:
# - Link to existing project? No
# - What's your project name? noah-platform
# - Which directory is code in? ./
# - Want to override settings? No
```

### Step 5: Configure Database
```bash
# Run migrations
npm run db:push

# That's it! Your app is live at:
# https://noah-platform.vercel.app
```

---

## Option B: Deploy to AWS (30 minutes)

### Prerequisites
- AWS account with credits
- Docker installed
- AWS CLI configured

### Step 1: Quick Setup Script
```bash
# Create deployment script
cat > deploy-aws.sh << 'EOF'
#!/bin/bash

# Variables
REGION="us-east-1"
APP_NAME="noah"
DOMAIN="noah-platform.com"  # Change this

# Create ECR repositories
aws ecr create-repository --repository-name noah-web --region $REGION
aws ecr create-repository --repository-name noah-api --region $REGION

# Get login token
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $(aws sts get-caller-identity --query Account --output text).dkr.ecr.$REGION.amazonaws.com

# Build and push images
docker build -t noah-web ./apps/web
docker build -t noah-api ./apps/api

ECR_URI=$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$REGION.amazonaws.com
docker tag noah-web:latest $ECR_URI/noah-web:latest
docker tag noah-api:latest $ECR_URI/noah-api:latest
docker push $ECR_URI/noah-web:latest
docker push $ECR_URI/noah-api:latest

echo "Images pushed to ECR!"
echo "Next: Deploy using AWS Copilot or ECS Console"
EOF

chmod +x deploy-aws.sh
./deploy-aws.sh
```

### Step 2: Deploy with AWS Copilot
```bash
# Install Copilot
curl -Lo copilot https://github.com/aws/copilot-cli/releases/latest/download/copilot-linux
chmod +x copilot
sudo mv copilot /usr/local/bin/copilot

# Initialize application
copilot app init noah

# Deploy environments
copilot env init --name production
copilot env deploy --name production

# Deploy services
copilot svc init --name web
copilot svc init --name api
copilot svc deploy --name web --env production
copilot svc deploy --name api --env production
```

### Step 3: Set Up RDS Database
```bash
# Create RDS instance
aws rds create-db-instance \
  --db-instance-identifier noah-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 14.7 \
  --master-username noahadmin \
  --master-user-password YourSecurePassword123! \
  --allocated-storage 20 \
  --backup-retention-period 7 \
  --no-publicly-accessible

# Wait for creation (5-10 minutes)
aws rds wait db-instance-available --db-instance-identifier noah-db

# Get endpoint
aws rds describe-db-instances --db-instance-identifier noah-db --query 'DBInstances[0].Endpoint.Address' --output text
```

### Step 4: Configure and Launch
```bash
# Update environment variables in Copilot
copilot secret init
# Add DATABASE_URL, JWT_SECRET, etc.

# Get your app URL
copilot svc show --name web --json | jq -r '.routes[0].url'
```

---

## Option C: Single Server Deployment (10 minutes)

### For Testing/Small Scale - Deploy to a VPS

### Step 1: Get a Server
Choose one:
- DigitalOcean Droplet ($6/month)
- Linode ($5/month)
- AWS EC2 t3.micro (free tier)
- Hetzner Cloud (€4/month)

### Step 2: Quick Install Script
SSH into your server and run:

```bash
# One-command deployment
curl -fsSL https://raw.githubusercontent.com/your-repo/noah/main/scripts/quick-deploy.sh | bash

# Or manually:
cat > setup.sh << 'EOF'
#!/bin/bash

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres psql -c "CREATE USER noah WITH PASSWORD 'noah123';"
sudo -u postgres createdb -O noah noah_db

# Install Redis
sudo apt install -y redis-server
sudo systemctl enable redis-server

# Clone and setup app
git clone https://github.com/your-repo/noah.git /opt/noah
cd /opt/noah
npm install
npm run build

# Create env file
cat > .env.production << 'ENVFILE'
DATABASE_URL=postgresql://noah:noah123@localhost:5432/noah_db
REDIS_URL=redis://localhost:6379
JWT_SECRET=$(openssl rand -base64 32)
NODE_ENV=production
PORT=3000
ENVFILE

# Run migrations
npm run db:push

# Start with PM2
pm2 start npm --name "noah-api" -- run start:api
pm2 start npm --name "noah-web" -- run start:web
pm2 save
pm2 startup

# Install Nginx
sudo apt install -y nginx
sudo cat > /etc/nginx/sites-available/noah << 'NGINX'
server {
    listen 80;
    server_name _;
    
    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

sudo ln -s /etc/nginx/sites-available/noah /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx

echo "✅ Noah is running at http://$(curl -s ifconfig.me)"
EOF

chmod +x setup.sh
./setup.sh
```

### Step 3: Add SSL (Optional but Recommended)
```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com
```

---

## 🏃 Post-Deployment Checklist

### Immediate Tasks (Do Now)
- [ ] Change default passwords
- [ ] Test file upload
- [ ] Test video playback
- [ ] Check error logs
- [ ] Verify database connection

### Within 24 Hours
- [ ] Set up monitoring (UptimeRobot free tier)
- [ ] Configure backups
- [ ] Set up error tracking (Sentry free tier)
- [ ] Test user registration
- [ ] Configure email sending

### Within 1 Week
- [ ] Load test the application
- [ ] Set up CDN for media files
- [ ] Implement rate limiting
- [ ] Configure log aggregation
- [ ] Document deployment process

---

## 🔧 Environment Variables Reference

### Essential (Required)
```bash
DATABASE_URL=postgresql://user:pass@host:5432/dbname
JWT_SECRET=minimum-32-character-secret
NODE_ENV=production
```

### Recommended
```bash
REDIS_URL=redis://localhost:6379
SESSION_SECRET=another-32-character-secret
CORS_ORIGIN=https://your-frontend-domain.com
API_URL=https://your-api-domain.com
```

### Optional
```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
SENTRY_DSN=your-sentry-dsn
```

---

## 🚨 Troubleshooting

### Database Connection Issues
```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check if PostgreSQL is running
sudo systemctl status postgresql

# Check logs
sudo tail -f /var/log/postgresql/*.log
```

### Application Won't Start
```bash
# Check PM2 logs
pm2 logs

# Check Node version
node --version  # Should be 18+

# Rebuild dependencies
rm -rf node_modules package-lock.json
npm install
npm run build
```

### High Memory Usage
```bash
# Restart services
pm2 restart all

# Check memory
free -h
pm2 monit
```

### Nginx Issues
```bash
# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Check logs
sudo tail -f /var/log/nginx/error.log
```

---

## 💰 Cost Comparison

| Provider | Monthly Cost | Best For |
|----------|-------------|----------|
| Vercel + Supabase | $0-20 | Prototypes, <1000 users |
| DigitalOcean Droplet | $6-12 | Small teams, <5000 users |
| AWS (minimal) | $50-100 | Growing apps, <10000 users |
| AWS (recommended) | $300-500 | Production, unlimited users |

---

## 🎯 Next Steps

1. **Monitor Your Deployment**
   - Set up uptime monitoring: [UptimeRobot](https://uptimerobot.com)
   - Add error tracking: [Sentry](https://sentry.io)
   - Watch logs: `pm2 logs` or Vercel dashboard

2. **Optimize Performance**
   - Enable caching headers
   - Set up CDN for media files
   - Optimize database queries

3. **Secure Your Application**
   - Enable rate limiting
   - Set up WAF rules
   - Regular security updates

4. **Scale When Needed**
   - Monitor resource usage
   - Set up auto-scaling rules
   - Implement caching layers

---

## 📞 Need Help?

- **Deployment Issues**: Check logs first, then review this guide
- **Performance Problems**: Monitor resources, check database queries
- **Security Concerns**: Run `npm audit`, update dependencies
- **Scaling Questions**: Start with vertical scaling, then horizontal

---

*Remember: Start simple, monitor everything, scale when needed. You can always migrate to a more complex setup later.*