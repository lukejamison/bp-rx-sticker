# 🚀 Quick Reference

## Start Development Server

```bash
cd app
npm run dev
```

Open: http://localhost:3000

## Test on Zebra T56

1. **Find your computer's IP:**
   ```bash
   # Mac
   ipconfig getifaddr en0
   
   # Windows
   ipconfig
   ```

2. **On T56, open Chrome:**
   ```
   http://YOUR_IP:3000
   ```

## Key Files

- `app/lib/api.ts` - API client (change base URL here)
- `app/lib/zpl.ts` - Label format (customize label here)
- `app/components/` - UI components
- `app/.env.local` - Configuration

## Customization

### Change API URL
Edit `app/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://YOUR_API_SERVER:3000
```

### Change Label Format
Edit `app/lib/zpl.ts` - modify the ZPL commands

### Change Time Window
Default is 24 hours. To change, edit `app/lib/store.ts`:
```typescript
const response = await api.lookupBarcode(code.trim(), 48); // 48 hours
```

## Testing Without Hardware

The app will show errors about Zebra Browser Print if not installed. That's normal.

To test the UI without a printer:
1. Open app in browser
2. Type a barcode manually (or scan with webcam)
3. You'll see the API lookup work
4. Printing will fail (need Zebra Browser Print)

## Deploy to Production

```bash
cd app
npm run build
npm start
```

Or use PM2:
```bash
pm2 start npm --name "prx-sticker" -- start
pm2 save
```

## Useful Commands

```bash
# Install dependencies
cd app && npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Check for TypeScript errors
npm run lint

# Clean and reinstall
rm -rf node_modules .next && npm install
```

## Browser DevTools

Open Chrome DevTools (F12) to:
- See console logs
- Debug API calls (Network tab)
- Test responsive design
- Check for errors

## Tips

- Input auto-focuses - just scan!
- Scanning clears input automatically
- Audio beep on success/error
- Progress bar updates in real-time
- Tap completed items to reprint

---

**Need help?** See `README.md` or `app/README.md`
