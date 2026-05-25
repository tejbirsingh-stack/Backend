# Railway Deployment Guide for Noah Platform

## Quick Deploy Steps

### 1. Prerequisites
- Railway account (https://railway.app)
- GitHub repository connected
- PostgreSQL database provisioned on Railway

### 2. Deploy to Railway

#### Option A: Deploy Button (Recommended)
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/noah)

#### Option B: Manual Deploy

1. **Create New Project**
   ```bash
   railway login
   railway init
   ```

2. **Add PostgreSQL Database**
   ```bash
   railway add postgresql
   ```

3. **Set Environment Variables**
   Copy from `.env.railway` and set in Railway dashboard:
   - Go to your service → Variables
   - Add each variable from `.env.railway`
   - Update values with your actual credentials

4. **Deploy**
   ```bash
   git push origin main
   ```
   Railway will automatically deploy from GitHub

### 3. Environment Variables (Required)

```env
# Database - Automatically provided by Railway
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Application
NODE_ENV=production
PORT=3000
JWT_SECRET=<generate-strong-secret>
SESSION_SECRET=<generate-strong-secret>

# CORS - Update with your frontend URL
CORS_ORIGIN=https://your-frontend.railway.app

# Storage (Required for media)
B2_KEY_ID=<your-backblaze-key>
B2_APPLICATION_KEY=<your-backblaze-app-key>
B2_BUCKET_NAME=noah-media-prod
```

### 4. Post-Deployment Setup

1. **Run Database Migrations**
   ```bash
   railway run npm run db:migrate:deploy
   ```

2. **Seed Visit Detroit Test Data**
   ```bash
   railway run cd packages/@noah/db && npx tsx prisma/seed-visit-detroit.ts
   ```

3. **Verify Deployment**
   - Check health endpoint: `https://your-app.railway.app/api/health`
   - Login with test account: `sarah@visitdetroit.com` / `Detroit2024!`

### 5. Frontend Deployment

Create a separate Railway service for the frontend:

1. **Create Frontend Service**
   ```bash
   railway add
   ```

2. **Set Build Command**
   ```
   cd apps/web && npm install && npm run build
   ```

3. **Set Start Command**
   ```
   cd apps/web && npm run preview
   ```

4. **Environment Variables**
   ```env
   VITE_API_URL=https://your-api.railway.app
   ```

## Current Working Features

✅ **What's Working:**
- Enhanced media server on port 3000
- Video player with professional controls
- File upload and listing
- Basic authentication
- Visit Detroit organization structure

⚠️ **Known Issues:**
- Video controls may not show in main app (use test player for demo)
- Database migrations need to be run manually
- B2 integration pending configuration

## Demo Accounts

After seeding, these accounts will be available:

| Role | Email | Password | Access |
|------|-------|----------|--------|
| System Admin | admin@noah.app | SystemAdmin123! | Full system access |
| Org Admin | sarah@visitdetroit.com | Detroit2024! | Visit Detroit admin |
| Team Member | mike@visitdetroit.com | Detroit2024! | Upload, share |
| Team Member | jessica@visitdetroit.com | Detroit2024! | Upload, share |

## Quick Test URLs

- **API Health**: `/api/health`
- **Media List**: `/api/media`
- **Test Video Player**: `/?test=video`
- **Upload Test**: `/api/media/upload`

## Troubleshooting

### Database Connection Issues
```bash
# Check connection
railway run npx prisma db pull

# Reset database
railway run npx prisma migrate reset --force
```

### Port Issues
Railway automatically assigns PORT. Don't hardcode port 3000 in production:
```javascript
const PORT = process.env.PORT || 3000;
```

### CORS Issues
Ensure CORS_ORIGIN matches your frontend URL exactly:
```env
CORS_ORIGIN=https://noah-web.railway.app
```

### File Upload Issues
Check file size limits and ensure B2 credentials are correct:
```env
MAX_FILE_SIZE=524288000  # 500MB
```

## Monitoring

### Logs
```bash
railway logs
```

### Database
```bash
railway run npx prisma studio
```

## Rollback

If deployment fails:
```bash
railway down
railway up --detach
```

## Support

- Railway Discord: https://discord.gg/railway
- Railway Docs: https://docs.railway.app
- Noah Issues: https://github.com/yourusername/noah/issues