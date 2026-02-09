# Dark Mode Support

## ✅ Dark Mode Added!

Your app now has full dark mode support with these features:

- 🌙 **Auto-detection** - Detects system preference on first load
- 💾 **Persistent** - Saves your choice in localStorage
- 🎨 **Complete coverage** - All components styled for dark mode
- ⚡ **Instant toggle** - Switch themes with one click

## How to Use

### Toggle Button
Click the sun/moon icon in the header to switch between light and dark modes.

- ☀️ **Light mode** - Shows moon icon
- 🌙 **Dark mode** - Shows sun icon

### Auto-Detection
On first visit, the app automatically:
1. Checks your system preference (dark/light)
2. Applies the matching theme
3. Saves to localStorage for future visits

### Manual Control
You can override system preference anytime by clicking the toggle button.

## What's Styled for Dark Mode

✅ **Header** - Dark background, light text  
✅ **Scan Input** - Dark input field, light text  
✅ **Invoice Display** - Dark cards, adjusted progress bar  
✅ **Item Rows** - Dark backgrounds, proper borders  
✅ **Buttons** - Adjusted for dark mode  
✅ **Diagnostics Panel** - Full dark support  
✅ **Alerts** - Success/error messages in dark  
✅ **Empty State** - Dark card styling  

## Technical Details

### Implementation
- Uses Tailwind CSS v4 dark mode
- `class` strategy (controlled by React)
- No flash on page load
- Respects system preferences

### How It Works
```javascript
// Detects system preference
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

// Applies theme
document.documentElement.classList.add('dark'); // or remove

// Persists choice
localStorage.setItem('theme', 'dark');
```

### Color Scheme

**Light Mode:**
- Background: `#ffffff`
- Foreground: `#171717`
- Gray scale: 50-900

**Dark Mode:**
- Background: `#0a0a0a`
- Foreground: `#ededed`
- Adjusted grays for better contrast

## Customization

To adjust colors, edit `app/app/globals.css`:

```css
:root {
  --background: #ffffff;  /* Light mode bg */
  --foreground: #171717;  /* Light mode text */
}

:root.dark {
  --background: #0a0a0a;  /* Dark mode bg */
  --foreground: #ededed;  /* Dark mode text */
}
```

## Testing

1. **Start dev server:**
   ```bash
   cd app
   npm run dev
   ```

2. **Open http://localhost:3000**

3. **Click theme toggle** (sun/moon icon in header)

4. **Refresh page** - theme persists

5. **Change system preference** - app respects it

## Browser Support

✅ Chrome/Edge (Chromium)  
✅ Safari  
✅ Firefox  
⚠️ IE11 (not supported)  

## Mobile Experience

Works perfectly on Zebra T56:
- Toggle button in header
- Theme persists between sessions
- No flash on reload
- Respects device dark mode setting

## Tips

- **Battery saving** - Dark mode uses less power on OLED screens
- **Eye strain** - Dark mode easier on eyes in low light
- **Preference** - Choose what works best for you
- **Auto-switch** - Some devices auto-switch based on time of day

---

**Enjoy your new dark mode!** 🌙
