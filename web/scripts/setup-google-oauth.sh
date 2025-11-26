#!/bin/bash

# Google OAuth Setup Script for Capacitor
# This script helps configure Google OAuth for iOS and Android

set -e

echo "🔐 Google OAuth Setup for Capacitor"
echo "===================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env not found. Creating from .env.example..."
    if [ -f .env.example ]; then
        cp .env.example .env
    else
        touch .env
    fi
fi

# Function to prompt for input
prompt_input() {
    local var_name=$1
    local prompt_text=$2
    local current_value=$(grep "^${var_name}=" .env 2>/dev/null | cut -d '=' -f2)
    
    echo ""
    echo "${prompt_text}"
    if [ ! -z "$current_value" ]; then
        echo "Current value: ${current_value}"
        read -p "New value (press Enter to keep current): " input_value
        if [ -z "$input_value" ]; then
            input_value=$current_value
        fi
    else
        read -p "Value: " input_value
    fi
    
    # Update or add to .env
    if grep -q "^${var_name}=" .env; then
        # Update existing
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^${var_name}=.*|${var_name}=${input_value}|" .env
        else
            sed -i "s|^${var_name}=.*|${var_name}=${input_value}|" .env
        fi
    else
        # Add new
        echo "${var_name}=${input_value}" >> .env
    fi
}

echo "📝 Step 1: Configure Environment Variables"
echo "----------------------------------------"
echo "You'll need OAuth 2.0 Client IDs from Google Cloud Console:"
echo "https://console.cloud.google.com/apis/credentials"
echo ""

# Web Client (for Next.js backend)
prompt_input "GOOGLE_CLIENT_ID" "Web Client ID (for Next.js):"
prompt_input "GOOGLE_CLIENT_SECRET" "Web Client Secret:"

# Public client IDs (for frontend/native)
prompt_input "NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID" "Web Client ID (public, same as above):"
prompt_input "NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID" "iOS Client ID:"
prompt_input "NEXT_PUBLIC_GOOGLE_ANDROID_CLIENT_ID" "Android Client ID (optional for now):"

echo ""
echo "✅ Environment variables configured in .env"

# Auto-sync native configuration
echo ""
echo "🔄 Step 2: Sync Native Configuration"
echo "-----------------------------------"
echo "Running automatic configuration sync..."
echo ""

if command -v node &> /dev/null; then
    node scripts/sync-native-config.js
else
    echo "⚠️  Node.js not found. Please install Node.js to use auto-sync."
fi

echo ""
echo "📱 iOS Configuration"
echo "------------------"
if [ -d "ios" ]; then
    echo "✅ iOS project found"
    echo "   Config files will be auto-updated when you run 'npm run cap:sync'"
else
    echo "⏭️  iOS project not found. Run 'npx cap add ios' to create it."
fi

echo ""
echo "🤖 Android Configuration"
echo "----------------------"
if [ -d "android" ]; then
    echo "✅ Android project found"
    echo "   Config files will be auto-updated when you run 'npm run cap:sync'"
    echo ""
    echo "⚠️  Don't forget to add your SHA-1 fingerprint to Google Cloud Console!"
    echo "Run this command to get your debug keystore SHA-1:"
    echo ""
    echo "keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android"
else
    echo "⏭️  Android project not found. Run 'npx cap add android' to create it."
fi

echo ""
echo "🎉 Setup Complete!"
echo "================="
echo ""
echo "✨ Your environment variables are configured!"
echo "   Native config files (Info.plist, strings.xml) will be auto-updated."
echo ""
echo "Next steps:"
echo ""
echo "1️⃣  Sync Capacitor and update native configs:"
echo "   npm run cap:sync"
echo ""
echo "2️⃣  (Android only) Add SHA-1 to Google Cloud Console"
echo ""
echo "3️⃣  Test on each platform:"
echo "   Web:     npm run dev"
echo "   iOS:     npx cap open ios"
echo "   Android: npx cap open android"
echo ""
echo "📚 For detailed instructions, see: GOOGLE_OAUTH_SETUP.md"
echo ""

