# PRX Sticker System - Setup Guide

## Quick Start

### 1. Backend is Ready ✅
You've already added the API endpoints and database table. Great!

### 2. Install the PWA App

```bash
cd app
npm install
```

### 3. Download Zebra Browser Print SDK

**Important:** You need to download the Zebra Browser Print JavaScript SDK:

1. Go to: https://www.zebra.com/us/en/support-downloads/software/printer-software/browser-print.html
2. Download "Browser Print for Web"
3. Extract the ZIP
4. Copy `BrowserPrint-3.x.xxx.min.js` to `app/public/`
5. Rename it to `BrowserPrint-3.1.250.min.js`

### 4. Configure API URL

Edit `app/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://172.18.129.154:3000
```

### 5. Run the App

```bash
cd app
npm run dev
```

Open http://localhost:3000

### 6. Test on Zebra T56

1. **Install Zebra Browser Print** on the T56 device
   - Download Android version from Zebra website
   - Install and start the service

2. **Pair Bluetooth Printer**
   - Settings → Bluetooth → Pair printer

3. **Access the App**
   - Find your computer's IP: `ipconfig getifaddr en0` (Mac) or `ipconfig` (Windows)
   - On T56, open Chrome and go to: `http://YOUR_IP:3000`

4. **Test Scanning**
   - Scan a barcode from a recent invoice (last 24 hours)
   - Label should print automatically
   - Item marked as completed

## Project Structure

```
bp-rx-sticker/
├── README.md                 # This file
├── setup.sh                  # Database setup script
├── migrations/               # Database migration
├── api-endpoints/            # API endpoint code (already added)
├── help_docs/               # Documentation
└── app/                     # PWA Application
    ├── README.md            # App-specific docs
    ├── app/                 # Next.js app directory
    ├── components/          # React components
    ├── lib/                 # Utilities (API, printer, ZPL)
    ├── types/               # TypeScript types
    └── public/              # Static files
```

## Testing Checklist

- [ ] API endpoints working (`curl http://172.18.129.154:3000/health`)
- [ ] Database table created (`prx_invoices_completed`)
- [ ] App runs locally (`npm run dev`)
- [ ] Zebra Browser Print installed on T56
- [ ] Bluetooth printer paired with T56
- [ ] App accessible from T56
- [ ] Barcode scan triggers lookup
- [ ] Label prints successfully
- [ ] Item marked as completed in database
- [ ] Reprint button works

## Common Issues

### "Zebra Browser Print not found"
- Download and install from Zebra website
- Ensure service is running

### "No printer found"
- Check Bluetooth pairing
- Verify printer is powered on
- Check printer has labels loaded

### "Item not found"
- Invoice must be within last 24 hours
- Check barcode is valid UPC or NDC
- Verify API has invoice data

### "API connection failed"
- Check T56 on same network as API server
- Verify API URL in `.env.local`
- Test API: `curl http://172.18.129.154:3000/health`

## Deployment

### Option 1: Vercel (Recommended - Free & Easy)

**Quick Deploy:**
1. Push to GitHub: `git push`
2. Go to https://vercel.com → Import Project
3. Select your repo
4. Set **Root Directory** to: `app`
5. Add environment variable:
   - `NEXT_PUBLIC_API_URL` = `http://172.18.129.154:3000`
6. Deploy!

**You'll get:** `https://your-app.vercel.app` in ~2 minutes

📖 **Full guide:** See `DEPLOY_VERCEL.md`

### Option 2: Local Development
```bash
cd app
npm run dev
# Access from T56 at http://YOUR_IP:3000
```

### Option 3: Self-Host (Production Server)
```bash
cd app
npm run build
npm start
# Or use PM2: pm2 start npm --name "prx-sticker" -- start
```

## Support

- API Documentation: See `help_docs/PRX_INVOICE_SYSTEM_DOCUMENTATION.md`
- App Documentation: See `app/README.md`
- Contact: Luke (CTO)

---

**Ready to test!** 🚀

Start with: `cd app && npm install && npm run dev`
