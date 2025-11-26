#!/usr/bin/env node

/**
 * Sync Native Configuration Script
 *
 * This script automatically generates iOS and Android configuration files
 * from environment variables before running Capacitor sync.
 *
 * Usage: node scripts/sync-native-config.js
 */

const fs = require('fs');
const path = require('path');

// Get the web directory (parent of scripts directory)
const webDir = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(webDir, '.env') });

const config = {
  googleWebClientId: process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
  googleIosClientId: process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID || '',
  googleAndroidClientId: process.env.NEXT_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '',
};

console.log('🔄 Syncing native configuration files...\n');

// Check if required environment variables are set
const hasGoogleAuth = config.googleWebClientId && (config.googleIosClientId || config.googleAndroidClientId);

if (!hasGoogleAuth) {
  console.log('⚠️  Google OAuth environment variables not found.');
  console.log('   Skipping native OAuth configuration.');
  console.log('   To enable Google OAuth, set these in .env:');
  console.log('   - NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID');
  console.log('   - NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID (for iOS)');
  console.log('   - NEXT_PUBLIC_GOOGLE_ANDROID_CLIENT_ID (for Android)\n');
} else {
  console.log('✅ Found Google OAuth configuration\n');
}

/**
 * Sync iOS Configuration
 */
function syncIosConfig() {
  const infoPlistPath = path.join(__dirname, '..', 'ios', 'App', 'App', 'Info.plist');
  const infoPlistTemplatePath = path.join(__dirname, '..', 'ios', 'App', 'App', 'Info.plist.template');

  // Check if iOS project exists
  if (!fs.existsSync(path.join(__dirname, '..', 'ios'))) {
    console.log('⏭️  iOS project not found, skipping...');
    return;
  }

  // Create Info.plist from template if it doesn't exist
  if (!fs.existsSync(infoPlistPath)) {
    if (fs.existsSync(infoPlistTemplatePath)) {
      console.log('📋 Creating Info.plist from template...');
      fs.copyFileSync(infoPlistTemplatePath, infoPlistPath);
    } else {
      console.log('⚠️  Info.plist and template not found, skipping iOS config...');
      return;
    }
  }

  if (!config.googleIosClientId) {
    console.log('⏭️  iOS Google Client ID not set, skipping iOS config...');
    return;
  }

  try {
    let infoPlist = fs.readFileSync(infoPlistPath, 'utf8');

    // Get reversed client IDs for both iOS and Web
    const reversedIosClientId = config.googleIosClientId
      .replace('.apps.googleusercontent.com', '')
      .split('.')
      .reverse()
      .join('.');
    const fullReversedIosId = `com.googleusercontent.apps.${reversedIosClientId}`;

    const reversedWebClientId = config.googleWebClientId
      .replace('.apps.googleusercontent.com', '')
      .split('.')
      .reverse()
      .join('.');
    const fullReversedWebId = `com.googleusercontent.apps.${reversedWebClientId}`;

    // Update or add CFBundleURLSchemes (need both iOS and Web reversed IDs)
    if (infoPlist.includes('CFBundleURLSchemes')) {
      // Replace the array content with both schemes
      infoPlist = infoPlist.replace(
        /(<key>CFBundleURLSchemes<\/key>[\s\S]*?<array>[\s\S]*?)<\/array>/,
        `$1\n\t\t\t\t<string>${fullReversedIosId}</string>\n\t\t\t\t<string>${fullReversedWebId}</string>\n\t\t\t</array>`
      );
    }

    // Update or add GIDClientID (handles comments between key and value)
    if (infoPlist.includes('GIDClientID')) {
      infoPlist = infoPlist.replace(
        /(<key>GIDClientID<\/key>[\s\S]*?<string>)[^<]+(<\/string>)/,
        `$1${config.googleIosClientId}$2`
      );
    }

    // Update or add GIDServerClientID (handles comments between key and value)
    if (infoPlist.includes('GIDServerClientID')) {
      infoPlist = infoPlist.replace(
        /(<key>GIDServerClientID<\/key>[\s\S]*?<string>)[^<]+(<\/string>)/,
        `$1${config.googleWebClientId}$2`
      );
    }

    fs.writeFileSync(infoPlistPath, infoPlist);
    console.log('✅ iOS Info.plist updated');
    console.log(`   - iOS Reversed Client ID: ${fullReversedIosId}`);
    console.log(`   - Web Reversed Client ID: ${fullReversedWebId}`);
    console.log(`   - GIDClientID: ${config.googleIosClientId}`);
    console.log(`   - GIDServerClientID: ${config.googleWebClientId}\n`);
  } catch (error) {
    console.error('❌ Error updating iOS config:', error.message);
  }
}

/**
 * Sync Android Configuration
 */
function syncAndroidConfig() {
  const stringsDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res', 'values');
  const stringsPath = path.join(stringsDir, 'strings.xml');
  const stringsTemplatePath = path.join(stringsDir, 'strings.xml.template');

  if (!fs.existsSync(path.join(__dirname, '..', 'android'))) {
    console.log('⏭️  Android project not found, skipping...');
    return;
  }

  if (!config.googleWebClientId) {
    console.log('⏭️  Google Web Client ID not set, skipping Android config...');
    return;
  }

  try {
    // Create directory if it doesn't exist
    if (!fs.existsSync(stringsDir)) {
      fs.mkdirSync(stringsDir, { recursive: true });
    }

    // Create from template if doesn't exist
    if (!fs.existsSync(stringsPath) && fs.existsSync(stringsTemplatePath)) {
      console.log('📋 Creating strings.xml from template...');
      fs.copyFileSync(stringsTemplatePath, stringsPath);
    }

    // Use Android Client ID if available, otherwise fall back to Web Client ID
    const androidClientId = config.googleAndroidClientId || config.googleWebClientId;

    const stringsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Glass</string>
    <string name="title_activity_main">Glass</string>
    <string name="package_name">com.speakglass.app</string>
    <string name="custom_url_scheme">com.speakglass.app</string>
    <!-- Auto-generated from NEXT_PUBLIC_GOOGLE_ANDROID_CLIENT_ID or NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID -->
    <string name="server_client_id">${androidClientId}</string>
</resources>
`;

    fs.writeFileSync(stringsPath, stringsXml);
    console.log('✅ Android strings.xml updated');
    console.log(`   - server_client_id: ${androidClientId}\n`);
  } catch (error) {
    console.error('❌ Error updating Android config:', error.message);
  }
}

/**
 * Main execution
 */
function main() {
  if (hasGoogleAuth) {
    syncIosConfig();
    syncAndroidConfig();
    console.log('🎉 Native configuration sync complete!\n');
  } else {
    console.log('⏭️  No Google OAuth configuration to sync.\n');
  }
}

main();
