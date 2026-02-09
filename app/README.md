# PRX Sticker System - PWA Application

A Progressive Web App for scanning prescription drug invoice items and automatically printing 1"x1" labels using Zebra mobile Bluetooth printers.

## Features

- ✅ Auto-focus barcode input - always ready to scan
- ✅ Smart barcode lookup (UPC or NDC)
- ✅ Automatic label printing via Zebra Browser Print
- ✅ Real-time invoice progress tracking
- ✅ Duplicate prevention
- ✅ Reprint capability
- ✅ Audio feedback on scan success/error
- ✅ Responsive design for mobile devices

## Prerequisites

### On Zebra T56 Device

1. **Install Zebra Browser Print**
   - Download from: https://www.zebra.com/us/en/support-downloads/software/printer-software/browser-print.html
   - Install the Android version on your T56
   - Start the Browser Print service

2. **Pair Bluetooth Printer**
   - Go to Settings → Bluetooth
   - Pair your Zebra mobile printer (ZQ320/ZQ520/ZQ630)
   - Ensure it's connected

3. **Download Zebra Browser Print JS SDK**
   - Download from the same link above
   - Extract and copy `BrowserPrint-3.x.xxx.min.js` to `public/` folder
   - Rename to `BrowserPrint-3.1.250.min.js`

## Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Configuration

Edit `.env.local` to set your API URL:

```env
NEXT_PUBLIC_API_URL=http://172.18.129.154:3000
```

## Development

```bash
# Start dev server
npm run dev

# Open http://localhost:3000 in your browser
# Or open on the T56 device at http://YOUR_COMPUTER_IP:3000
```

## Deployment

### Option 1: Deploy to Same Server as API (Recommended)

```bash
# Build the app
npm run build

# Copy the build to your server
scp -r .next out public luke@172.18.129.154:/var/www/prx-sticker/

# Or use a process manager like PM2
pm2 start npm --name "prx-sticker" -- start
```

### Option 2: Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel deploy --prod
```

### Option 3: Docker

```bash
# Build Docker image
docker build -t prx-sticker .

# Run container
docker run -p 3000:3000 prx-sticker
```

## Usage

1. **Open app** on Zebra T56 device
2. **Scan barcode** - input is auto-focused, just scan
3. **Label prints automatically** if item found and not already scanned
4. **View progress** - see X of Y items completed
5. **Reprint** - tap any completed item to reprint

## Project Structure

```
app/
├── app/
│   ├── page.tsx              # Main page
│   ├── layout.tsx            # Root layout with PWA manifest
│   └── globals.css           # Global styles
├── components/
│   ├── ScanInput.tsx         # Auto-focus barcode input
│   ├── InvoiceDisplay.tsx    # Progress bar and invoice info
│   ├── ItemRow.tsx           # Individual item display
│   ├── PrinterStatus.tsx     # Printer connection status
│   └── Alert.tsx             # Success/error notifications
├── lib/
│   ├── api.ts                # API client functions
│   ├── printer.ts            # Zebra Browser Print integration
│   ├── zpl.ts                # ZPL label generation
│   └── store.ts              # Zustand state management
├── types/
│   └── index.ts              # TypeScript interfaces
└── public/
    ├── manifest.json          # PWA manifest
    ├── icon.svg               # App icon
    └── BrowserPrint-*.js      # Zebra Browser Print SDK
```

## Key Components

### ScanInput
- Auto-focuses on mount and after each scan
- Handles barcode input
- Shows loading state during processing

### InvoiceDisplay
- Shows current invoice number and supplier
- Displays progress bar
- Shows completion percentage

### ItemRow
- Displays item details
- Shows completion status (checkmark or circle)
- Expandable for more details
- Reprint button for completed items

### Store (Zustand)
- Manages application state
- Handles barcode scanning workflow
- Manages printer connection
- Coordinates API calls and printing

## API Endpoints Used

- `GET /api/items/barcode/:code/recent` - Lookup item by UPC/NDC
- `POST /api/completed` - Mark item as scanned/printed
- `GET /api/invoices/:id/items` - Get full invoice with progress

## Troubleshooting

### Printer Not Connecting

1. Check Zebra Browser Print is installed and running
2. Verify printer is paired via Bluetooth
3. Check printer has labels loaded
4. Try reconnecting in the app

### Item Not Found

- Check if invoice is within 24 hours (default time window)
- Verify barcode is correct UPC or NDC
- Check API is accessible from T56 device

### Barcode Scanner Not Working

- Ensure input field has focus (auto-focuses by default)
- Try tapping the screen to refocus
- Check scanner settings on T56

### API Connection Error

- Verify API URL in `.env.local`
- Check T56 is on same network as API server
- Test API endpoint in browser: `http://172.18.129.154:3000/health`

## Performance Tips

- The app uses auto-focus to keep input ready
- Scanning immediately triggers API lookup and print
- State management keeps UI responsive
- API calls are cached where appropriate

## Browser Compatibility

- ✅ Chrome/Chromium (recommended)
- ✅ Safari (iOS/iPadOS)
- ⚠️ Firefox (limited PWA support)
- ✅ Edge

## PWA Features

- Install to home screen
- Offline-ready (manifest configured)
- Full-screen mode on mobile
- App-like experience

## Security Notes

- Currently no authentication (internal network only)
- For production, add API key or JWT authentication
- Use HTTPS in production
- Implement rate limiting if needed

## License

Internal use only - Bushard's Pharmacy

---

**Version**: 1.0  
**Last Updated**: February 8, 2026  
**Contact**: Luke (CTO)
