#!/bin/bash
set -e

# Sync version from package.json to native projects
echo "📦 Syncing version..."
node scripts/sync-version.js

# Temporarily move API routes
mv app/api .api-tmp
trap 'mv .api-tmp app/api 2>/dev/null || true' EXIT

# Clean and build
rm -rf .next
NEXT_PUBLIC_GLASS_API_URL=https://api.speakglass.com CAPACITOR_BUILD=true next build

# Create root index.html that detects user language and redirects
cat > out/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Glass</title>
  <script>
    // Detect user's preferred language
    const supportedLangs = ['en', 'ko', 'ja', 'es', 'fr', 'zh'];
    const browserLang = navigator.language.split('-')[0];
    const lang = supportedLangs.includes(browserLang) ? browserLang : 'en';
    window.location.href = '/' + lang;
  </script>
</head>
<body>
  <noscript>
    <a href="/en">Continue to Glass</a>
  </noscript>
</body>
</html>
EOF

# Sync with Capacitor
cap sync

