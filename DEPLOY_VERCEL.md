# Deploy to Vercel

## Quick Deploy (Easiest)

1. **Push to GitHub** (if not already)
   ```bash
   cd /Volumes/DataHubMini/Github_2/bp-rx-sticker
   git add .
   git commit -m "Add PWA app"
   git push
   ```

2. **Go to Vercel**
   - Visit: https://vercel.com
   - Sign in with GitHub
   - Click "Add New Project"
   - Select `bp-rx-sticker` repository
   - Vercel will auto-detect Next.js

3. **Configure Root Directory**
   - Set **Root Directory** to: `app`
   - This tells Vercel the Next.js app is in the `app` folder

4. **Add Environment Variable**
   - Click "Environment Variables"
   - Add:
     - Name: `NEXT_PUBLIC_API_URL`
     - Value: `http://172.18.129.154:3000`
   - Click "Add"

5. **Deploy!**
   - Click "Deploy"
   - Wait ~2 minutes
   - You'll get a URL like: `https://bp-rx-sticker.vercel.app`

## Important: API Accessibility

⚠️ **Your API must be accessible from the internet** for Vercel to work.

### Option 1: Keep Local API (Recommended for Testing)

Your API at `172.18.129.154:3000` is only accessible on your local network. For Vercel to work:

**Best Solution:** Access Vercel app from T56 on your local network, and the T56 will call your local API directly (client-side requests).

This works because:
- Vercel hosts the frontend (static files + React)
- T56 device makes API calls directly to your local server
- No need to expose API to internet

### Option 2: Expose API to Internet (Production)

If you want to access from anywhere:

1. **Use ngrok (quick test)**
   ```bash
   # On your API server
   ngrok http 3000
   # You'll get: https://abc123.ngrok.io
   ```
   
   Then update Vercel environment variable:
   ```
   NEXT_PUBLIC_API_URL=https://abc123.ngrok.io
   ```

2. **Set up proper hosting (production)**
   - Deploy API to cloud (DigitalOcean, AWS, etc.)
   - Or expose via your router with port forwarding
   - Use a domain name
   - Add HTTPS certificate

## Deploy Commands

### Option A: Vercel CLI (If you prefer terminal)

```bash
# Install Vercel CLI
npm i -g vercel

# From the root of your repo
cd /Volumes/DataHubMini/Github_2/bp-rx-sticker

# Login
vercel login

# Deploy
vercel --yes

# When prompted, set:
# - Root Directory: app
# - Build Command: (leave default)
# - Output Directory: (leave default)

# Add environment variable
vercel env add NEXT_PUBLIC_API_URL production
# Enter: http://172.18.129.154:3000

# Deploy to production
vercel --prod
```

### Option B: GitHub Integration (Easiest - Recommended)

Just push to GitHub and import in Vercel dashboard. Every push auto-deploys!

## After Deployment

1. **Test the URL**
   - Vercel will give you: `https://your-app.vercel.app`
   - Open on your T56 device
   - App should load

2. **Test Scanning**
   - Make sure T56 is on your local network
   - Scan a barcode
   - Should hit your local API at `172.18.129.154:3000`

3. **Install PWA**
   - Open in Chrome on T56
   - Menu → "Add to Home Screen"
   - Now it's a full app!

## Vercel Configuration File

I'll create a `vercel.json` for optimal settings.

## Benefits of Vercel

✅ **Free hosting** - No credit card needed  
✅ **Auto SSL** - HTTPS included  
✅ **Auto deploys** - Push to git = auto deploy  
✅ **Fast CDN** - Loads instantly worldwide  
✅ **No server management** - Just push code  
✅ **Preview deployments** - Every branch gets a URL  

## Cost

- **Free tier**: Perfect for your use case
  - 100GB bandwidth/month
  - Unlimited sites
  - Auto SSL
  - No credit card required

## Troubleshooting

### "API connection failed"

Check:
1. T56 is on same network as API server
2. Environment variable is set correctly in Vercel
3. API is running: `curl http://172.18.129.154:3000/health`

### "Build failed"

- Make sure Root Directory is set to `app`
- Check build logs in Vercel dashboard
- Try building locally first: `cd app && npm run build`

## Alternative: Deploy API Too

If you want everything on Vercel:

1. **Convert API to serverless** (Vercel functions)
2. **Or keep API separate** and use a different host
3. **Or use Vercel + Supabase** for database

For now, keeping API local is simplest!

---

**Quick Start:**
1. Push to GitHub
2. Import to Vercel
3. Set Root Directory: `app`
4. Add env var: `NEXT_PUBLIC_API_URL`
5. Deploy!

**You'll get a URL in ~2 minutes** 🚀
