# Render Deployment Guide

## Prerequisites
- Render account (free tier available)
- Supabase DATABASE_URL
- Vercel frontend URL
- (Optional) Plaid API credentials

## Environment Variables Needed

Add these in Render dashboard after deployment:

1. **DATABASE_URL** - Your Supabase PostgreSQL connection string
   - Format: `postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres`
   - Get from Supabase Dashboard → Settings → Database

2. **FRONTEND_URL** - Your Vercel frontend URL
   - Format: `https://your-app.vercel.app`

3. **PLAID_REDIRECT_URI** - Your Vercel URL + callback path
   - Format: `https://your-app.vercel.app/api/plaid/callback`

4. **PLAID_CLIENT_ID** - (Optional) Your Plaid Sandbox client ID
5. **PLAID_SECRET** - (Optional) Your Plaid Sandbox secret

## Deployment Steps

### Option 1: Using render.yaml (Recommended)

1. Push backend code to GitHub/GitLab
2. Go to [Render Dashboard](https://dashboard.render.com)
3. Click "New +" → "Blueprint"
4. Connect your repository
5. Select `backend/render.yaml`
6. Review and deploy

### Option 2: Manual Web Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your repository
4. Configure:
   - **Name**: ledgerline-backend
   - **Region**: Oregon (or closest)
   - **Branch**: main
   - **Runtime**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
5. Add environment variables (see above)
6. Deploy

## Post-Deployment

1. **Get your Render URL**: `https://ledgerline-backend.onrender.com`
2. **Test health endpoint**: `https://ledgerline-backend.onrender.com/health`
3. **Update frontend** to use Render backend URL
4. **Run database migration** if needed (schema changes)

## Troubleshooting

- Build fails: Check Node version compatibility (uses Node 18+)
- Database connection: Verify Supabase DATABASE_URL format
- CORS errors: Ensure FRONTEND_URL matches your Vercel domain
- Port issues: Render automatically assigns PORT, our code handles this

## Cost

- Free tier: 512MB RAM, 0.1 CPU (sufficient for development)
- Paid tier starts at $7/month for production
