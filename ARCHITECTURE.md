# How Vercel Deployment Works

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    VERCEL CLOUD                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Your PWA App (Static Files + React)              │  │
│  │  https://bp-rx-sticker.vercel.app                 │  │
│  │  - HTML/CSS/JavaScript                            │  │
│  │  - React components                               │  │
│  │  - No backend, just frontend                      │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                         ↓
                    (User loads)
                         ↓
┌─────────────────────────────────────────────────────────┐
│              Zebra T56 Mobile Device                    │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Chrome Browser                                   │  │
│  │  App loaded from Vercel                           │  │
│  │  https://bp-rx-sticker.vercel.app                 │  │
│  └───────────────────────────────────────────────────┘  │
│                         ↓                               │
│  (App makes API calls from T56 device)                 │
│                         ↓                               │
└─────────────────────────────────────────────────────────┘
                         ↓
                  (Local Network)
                         ↓
┌─────────────────────────────────────────────────────────┐
│            Your Local API Server                        │
│  http://172.18.129.154:3000                            │
│  - Running on your network                             │
│  - PostgreSQL database                                 │
│  - Invoice data                                        │
└─────────────────────────────────────────────────────────┘
```

## Why This Works

1. **Vercel hosts the frontend only**
   - Static HTML/CSS/JavaScript files
   - React app code
   - No backend logic

2. **API stays on your local network**
   - Your data never leaves your network
   - Database stays private
   - API runs on your server (172.18.129.154)

3. **T56 device connects both**
   - Loads app from Vercel (internet)
   - Calls API directly (local network)
   - Works because T56 is on your network

## Key Benefits

✅ **No server management** - Vercel handles hosting  
✅ **Always online** - No need to keep laptop running  
✅ **Auto updates** - Push to GitHub = auto deploy  
✅ **Free** - No hosting costs  
✅ **Fast** - Loads instantly from CDN  
✅ **Secure** - API stays private on local network  

## Data Flow

```
1. User opens app on T56
   → Loads from Vercel (internet)
   
2. User scans barcode
   → T56 makes API call to 172.18.129.154:3000 (local)
   → Gets invoice data
   
3. App generates ZPL
   → Sends to Zebra printer via Browser Print (Bluetooth)
   
4. Label prints
   → T56 calls API to mark completed (local)
```

## Security

- ✅ API not exposed to internet
- ✅ Data stays on your network
- ✅ Only frontend hosted publicly
- ✅ T56 must be on your network to work

## Requirements

For this to work:
1. T56 must be on same network as API server
2. API server must be running (172.18.129.154:3000)
3. Database must be accessible
4. Zebra Browser Print installed on T56

## Alternatives

### Option A: Vercel + Local API (This Setup)
- Frontend: Vercel (free, fast)
- API: Your server (private, secure)
- Best for: Internal network use

### Option B: All Local
- Frontend: Your server or laptop
- API: Your server
- Best for: Maximum privacy, no internet needed

### Option C: All Cloud
- Frontend: Vercel
- API: Vercel Serverless or AWS Lambda
- Database: Supabase or AWS RDS
- Best for: Access from anywhere, full cloud

## Recommended: Option A (Vercel + Local API)

Perfect balance:
- Easy deployment (push to GitHub)
- No server management
- Data stays private
- Works great for internal use
- Free hosting

---

**Ready to deploy?** See `DEPLOY_CHECKLIST.md`
