# Deploy 2-Match Backend to Render

Complete guide for deploying your 2-Match backend to Render.

## Prerequisites

1. A [Render account](https://render.com) (free tier available)
2. Your GitHub repository connected to Render
3. Backend code pushed to your repository

## Deployment Methods

You can deploy using either:
- **Blueprint** (recommended): Automated setup using `render.yaml`
- **Manual**: Configure services through Render dashboard

---

## Method 1: Blueprint Deployment (Recommended)

This method uses the `render.yaml` file to automatically set up all services.

### Step 1: Push Code to GitHub

```bash
cd backend
git add .
git commit -m "Add Render configuration"
git push
```

### Step 2: Create Blueprint on Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Blueprint"**
3. Connect your GitHub repository
4. Select your repository
5. Render will detect the `render.yaml` file automatically
6. Click **"Apply"**

### Step 3: Configure Environment Variables

After the blueprint is applied, you need to set additional environment variables:

1. Go to your **2match-backend** service
2. Navigate to **Environment** tab
3. Add the following variables:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=(automatically set from database)
JWT_SECRET=(automatically generated)
JWT_REFRESH_SECRET=(automatically generated)

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your-cloudinary-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Frontend URLs
CORS_ORIGIN=https://yourdomain.com
FRONTEND_URL=https://yourdomain.com

# Optional: Sentry Error Tracking
SENTRY_DSN=your-sentry-dsn

# Optional: Email Service
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Optional: SMS Service (Twilio)
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=your-twilio-number
```

### Step 4: Run Database Migrations

After the first deployment:

1. Go to your **2match-backend** service
2. Click **"Shell"** tab
3. Run the migration command:

```bash
npx prisma migrate deploy
```

### Step 5: Verify Deployment

Test your API:

```bash
curl https://your-app-name.onrender.com/health
```

Expected response:
```json
{
  "status": "ok",
  "message": "2-Match API is running"
}
```

---

## Method 2: Manual Deployment

If you prefer manual setup or need more control:

### Step 1: Create PostgreSQL Database

1. In Render Dashboard, click **"New +"** → **"PostgreSQL"**
2. Configure:
   - **Name:** `2match-db`
   - **Database:** `2match`
   - **Region:** Choose closest to your users
   - **Plan:** Free (or paid for better performance)
3. Click **"Create Database"**
4. Copy the **Internal Database URL** (not External)

### Step 2: Create Web Service

1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repository
3. Configure:
   - **Name:** `2match-backend`
   - **Region:** Same as database
   - **Branch:** `main` (or your default branch)
   - **Root Directory:** `backend` (if monorepo) or leave blank
   - **Runtime:** `Node`
   - **Build Command:**
     ```bash
     npm install && npx prisma generate && npm run build
     ```
   - **Start Command:**
     ```bash
     npm start
     ```
   - **Plan:** Free (or paid for production)

4. Add **Environment Variables** (same as Method 1, Step 3)

5. Under **Advanced** settings:
   - **Health Check Path:** `/health`
   - **Auto-Deploy:** Enable for automatic deployments on git push

6. Click **"Create Web Service"**

### Step 3: Run Migrations

Follow Method 1, Step 4 to run migrations.

---

## Optional: Add Redis

If your application uses Redis for caching/sessions:

### Using Render Redis

1. Click **"New +"** → **"Redis"**
2. Configure:
   - **Name:** `2match-redis`
   - **Region:** Same as your web service
   - **Plan:** Free (or paid)
   - **Maxmemory Policy:** `allkeys-lru`
3. Click **"Create Redis"**
4. Copy the **Internal Redis URL**
5. Add to your web service environment variables:
   ```env
   REDIS_URL=<internal-redis-url>
   ```

### Using External Redis (Upstash)

Render's free Redis is limited. For better performance, use [Upstash](https://upstash.com):

1. Create free Upstash account
2. Create new Redis database
3. Copy the connection URL
4. Add to environment variables:
   ```env
   REDIS_URL=<upstash-redis-url>
   ```

---

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | Auto-set by Render |
| `JWT_SECRET` | JWT signing secret | Auto-generated |
| `JWT_REFRESH_SECRET` | Refresh token secret | Auto-generated |
| `CORS_ORIGIN` | Allowed frontend origins | `https://yourdomain.com` |
| `FRONTEND_URL` | Frontend URL | `https://yourdomain.com` |

### Optional Variables

| Variable | Description | Required For |
|----------|-------------|--------------|
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | Image uploads |
| `CLOUDINARY_API_KEY` | Cloudinary API key | Image uploads |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | Image uploads |
| `REDIS_URL` | Redis connection string | Caching, rate limiting |
| `SENTRY_DSN` | Sentry error tracking DSN | Error monitoring |
| `SMTP_HOST` | Email server host | Email sending |
| `SMTP_PORT` | Email server port | Email sending |
| `SMTP_USER` | Email account username | Email sending |
| `SMTP_PASS` | Email account password | Email sending |
| `TWILIO_ACCOUNT_SID` | Twilio account SID | SMS verification |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | SMS verification |
| `TWILIO_PHONE_NUMBER` | Twilio phone number | SMS verification |

---

## Custom Domain Setup

### Step 1: Add Custom Domain in Render

1. Go to your **2match-backend** service
2. Navigate to **Settings** → **Custom Domain**
3. Click **"Add Custom Domain"**
4. Enter your domain (e.g., `api.yourdomain.com`)
5. Click **"Save"**

### Step 2: Configure DNS

Add this DNS record at your domain registrar:

```
Type: CNAME
Name: api (or your subdomain)
Value: <provided-by-render>.onrender.com
TTL: 3600
```

### Step 3: Wait for SSL Certificate

Render will automatically provision a free SSL certificate via Let's Encrypt. This usually takes 5-10 minutes.

### Step 4: Update Frontend

Update your frontend environment variables:

```env
VITE_API_URL=https://api.yourdomain.com/api
VITE_SOCKET_URL=https://api.yourdomain.com
```

---

## Monitoring & Maintenance

### View Logs

1. Go to your **2match-backend** service
2. Click **"Logs"** tab
3. View real-time logs or filter by time range

### Metrics

1. Navigate to **Metrics** tab
2. Monitor:
   - CPU usage
   - Memory usage
   - Request count
   - Response times

### Manual Deploys

1. Go to **Manual Deploy** tab
2. Click **"Deploy latest commit"**
3. Or **"Clear build cache & deploy"** if needed

### Restart Service

If your service needs a restart:

1. Go to **Settings**
2. Click **"Manual Deploy"**
3. Choose **"Clear build cache & deploy"**

Or use Render CLI:
```bash
render services restart 2match-backend
```

---

## Database Management

### Connect to Database

#### Using Render Shell

1. Go to your **2match-db** database
2. Click **"Connect"** → **"External Connection"**
3. Use provided connection details with your favorite PostgreSQL client

#### Using Prisma Studio

From your local machine:

```bash
# Set DATABASE_URL to your Render database URL
DATABASE_URL="<render-external-database-url>" npx prisma studio
```

### Backup Database

#### Automatic Backups

Render automatically backs up paid PostgreSQL plans. For free plans, set up manual backups.

#### Manual Backup

```bash
# Download backup
curl -o backup.sql <render-backup-url>

# Or use pg_dump
pg_dump "<external-database-url>" > backup.sql
```

### Restore Database

```bash
# From local SQL file
psql "<external-database-url>" < backup.sql
```

---

## Troubleshooting

### Build Failures

**Issue:** Build command fails

**Solution:**
1. Check build logs in Render dashboard
2. Verify `package.json` scripts are correct
3. Ensure all dependencies are in `dependencies` (not `devDependencies`)
4. Try clearing build cache and redeploying

### Database Connection Issues

**Issue:** Cannot connect to database

**Solution:**
1. Verify `DATABASE_URL` is set correctly
2. Use **Internal Database URL** (not External) for Render-to-Render connections
3. Check database is running and not suspended (free tier)
4. Add `?sslmode=require` to connection string if needed

### Migration Failures

**Issue:** `prisma migrate deploy` fails

**Solution:**
```bash
# Reset Prisma client
npx prisma generate

# Try migration again
npx prisma migrate deploy

# If still failing, check migration files
npx prisma migrate status
```

### Free Tier Limitations

**Free tier services:**
- Spin down after 15 minutes of inactivity
- First request after spin-down takes 30-60 seconds
- 750 hours/month (shared across services)

**Solutions:**
1. Upgrade to paid plan ($7/month for always-on)
2. Use a cron job to ping `/health` endpoint every 10 minutes
3. Use [Uptime Robot](https://uptimerobot.com) for free monitoring + keep-alive

### CORS Errors

**Issue:** Frontend can't connect to backend

**Solution:**
1. Verify `CORS_ORIGIN` includes your frontend URL
2. Ensure protocol matches (https)
3. Check for trailing slashes
4. Redeploy after changing environment variables

### WebSocket Issues

**Issue:** Real-time features not working

**Solution:**
1. Render supports WebSockets on all plans
2. Verify `VITE_SOCKET_URL` points to backend root (not /api)
3. Check firewall/network doesn't block WebSocket connections
4. Test WebSocket connection: https://www.websocket.org/echo.html

---

## Cost Comparison

### Render Pricing

| Service | Free Tier | Paid Starter |
|---------|-----------|--------------|
| Web Service | 750 hrs/month, sleeps after 15min | $7/month, always on |
| PostgreSQL | 90 days, then deleted | $7/month, persistent |
| Redis | Limited, 25 MB | $10/month, 100 MB |

**Total for free tier:** $0 (with limitations)
**Total for production:** ~$21-24/month

### vs Railway

| Feature | Render | Railway |
|---------|--------|---------|
| Free tier | 750 hrs/month | $5 credit/month |
| Starter plan | $7/month | ~$5-10/month usage-based |
| PostgreSQL | $7/month | Usage-based |
| Sleep on inactivity | Yes (free tier) | No |
| Build minutes | Unlimited | Limited on free |
| Deployment speed | ~2-3 mins | ~1-2 mins |
| Support | Email | Discord + Email |

---

## Production Checklist

Before going live:

- [ ] All environment variables configured
- [ ] Database migrations completed successfully
- [ ] `/health` endpoint returns 200 OK
- [ ] Custom domain configured with SSL
- [ ] CORS configured correctly
- [ ] Error tracking (Sentry) set up
- [ ] Logs are being generated
- [ ] Test all critical API endpoints
- [ ] Test WebSocket connections
- [ ] Test image uploads (Cloudinary)
- [ ] Frontend connected and working
- [ ] Database backups configured
- [ ] Monitoring/uptime checks set up

---

## CI/CD Pipeline (Optional)

Render automatically deploys when you push to your connected branch. To customize:

### Deploy Hooks

Create a deploy hook for manual/automated deployments:

1. Go to **Settings** → **Deploy Hook**
2. Copy the webhook URL
3. Use in CI/CD pipelines:

```bash
curl -X POST <deploy-hook-url>
```

### GitHub Actions Example

```yaml
# .github/workflows/deploy.yml
name: Deploy to Render

on:
  push:
    branches: [main]
    paths:
      - 'backend/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Render Deploy
        run: curl -X POST ${{ secrets.RENDER_DEPLOY_HOOK }}
```

---

## Migration from Railway

If migrating from Railway:

### Step 1: Export Railway Database

```bash
# Connect to Railway database and export
railway run pg_dump > railway_backup.sql
```

### Step 2: Import to Render

```bash
# Import to Render database
psql "<render-external-database-url>" < railway_backup.sql
```

### Step 3: Update Environment Variables

Copy all environment variables from Railway to Render.

### Step 4: Test Backend on Render

Before switching, test everything works on Render while Railway is still running.

### Step 5: Update Frontend URLs

Change frontend environment variables to point to Render:

```env
VITE_API_URL=https://your-render-app.onrender.com/api
```

### Step 6: Switch DNS

Update DNS records to point to Render custom domain.

### Step 7: Monitor

Watch logs and metrics for the first 24-48 hours.

### Step 8: Decommission Railway

Once stable on Render, you can remove Railway services.

---

## Support & Resources

- **Render Documentation:** https://render.com/docs
- **Render Community:** https://community.render.com
- **Render Status:** https://status.render.com
- **Prisma + Render Guide:** https://render.com/docs/deploy-prisma

---

## Next Steps

After successful deployment:

1. ✅ Set up monitoring with Sentry
2. ✅ Configure uptime monitoring
3. ✅ Set up automated database backups
4. ✅ Add custom domain
5. ✅ Test all features thoroughly
6. ✅ Set up CI/CD if needed
7. ✅ Plan for scaling

**Your 2-Match backend is now live on Render!** 🚀
