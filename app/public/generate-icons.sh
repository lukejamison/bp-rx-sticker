#!/bin/bash

# Generate app icons from SVG
# Requires ImageMagick: brew install imagemagick

if ! command -v convert &> /dev/null; then
    echo "ImageMagick not found. Install with: brew install imagemagick"
    exit 1
fi

cd "$(dirname "$0")"

echo "Generating icons from icon.svg..."

# Generate 192x192
convert -background none icon.svg -resize 192x192 icon-192x192.png
echo "✓ Created icon-192x192.png"

# Generate 512x512
convert -background none icon.svg -resize 512x512 icon-512x512.png
echo "✓ Created icon-512x512.png"

# Generate favicon.ico
convert -background none icon.svg -resize 32x32 favicon.ico
echo "✓ Created favicon.ico"

echo ""
echo "✅ All icons generated successfully!"
echo ""
echo "If you want custom icons:"
echo "1. Replace icon.svg with your design"
echo "2. Run this script again: ./generate-icons.sh"
