# Vercel Deployment Checklist

## ✅ Step-by-Step

### 1. Push to GitHub
```bash
cd /Volumes/DataHubMini/Github_2/bp-rx-sticker
git add .
git commit -m "Ready for Vercel deployment"
git push
```

### 2. Import to Vercel
- [ ] Go to https://vercel.com
- [ ] Click "Sign in with GitHub"
- [ ] Click "Add New Project"
- [ ] Select `bp-rx-sticker` repository

### 3. Configure Project
- [ ] **Root Directory**: Set to `app` (IMPORTANT!)
- [ ] **Framework Preset**: Next.js (auto-detected)
- [ ] **Build Command**: `npm run build` (default)
- [ ] **Output Directory**: `.next` (default)

### 4. Environment Variables
- [ ] Click "Environment Variables"
- [ ] Add new variable:
  - **Name**: `NEXT_PUBLIC_API_URL`
  - **Value**: `http://172.18.129.154:3000`
- [ ] Click "Add"

### 5. Deploy
- [ ] Click "Deploy"
- [ ] Wait 1-2 minutes
- [ ] Copy your URL (e.g., `https://bp-rx-sticker.vercel.app`)

### 6. Test
- [ ] Open URL on T56 device
- [ ] Ensure T56 is on same network as API server
- [ ] Scan a barcode
- [ ] Verify label prints
- [ ] Check item marked as completed

### 7. Install PWA (Optional)
- [ ] Open app in Chrome on T56
- [ ] Menu → "Add to Home Screen"
- [ ] App now works like native app!

## Troubleshooting

### Build Failed
1. Check Root Directory is set to `app`
2. Verify app builds locally: `cd app && npm run build`
3. Check build logs in Vercel dashboard

### API Connection Failed
1. Ensure T56 is on your local network
2. Verify API is running: `curl http://172.18.129.154:3000/health`
3. Check environment variable in Vercel settings

### Printer Not Found
1. Install Zebra Browser Print on T56
2. Pair Bluetooth printer
3. Start Browser Print service

## After First Deploy

Every time you push to GitHub:
- Vercel auto-deploys
- New version live in ~1-2 minutes
- No manual deployment needed!

## Cost

**Free forever** for this use case:
- Unlimited deployments
- 100GB bandwidth/month (plenty for internal use)
- Auto SSL (HTTPS)
- Custom domain (optional)

## Your Vercel URL

After deployment, write your URL here:

```
https://_____________________.vercel.app
```

Share this URL with T56 devices or add to home screen!

---

**Time to deploy: ~5 minutes** ⚡
