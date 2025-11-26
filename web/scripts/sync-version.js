#!/usr/bin/env node

/**
 * Sync version from package.json to native projects
 * This ensures iOS and Android apps use the same version as package.json
 */

const fs = require('fs');
const path = require('path');

// Read version from package.json
const packageJson = require('../package.json');
const version = packageJson.version;
const [major, minor, patch] = version.split('.');
const versionCode = parseInt(major) * 10000 + parseInt(minor) * 100 + parseInt(patch);

console.log(`[Version Sync] Syncing version ${version} (code: ${versionCode})`);

// Update Android version
const androidGradlePath = path.join(__dirname, '../android/app/build.gradle');
if (fs.existsSync(androidGradlePath)) {
  let androidGradle = fs.readFileSync(androidGradlePath, 'utf8');
  androidGradle = androidGradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  androidGradle = androidGradle.replace(/versionName\s+"[^"]+"/, `versionName "${version}"`);
  fs.writeFileSync(androidGradlePath, androidGradle);
  console.log(`[Version Sync] ✅ Updated Android: ${version} (${versionCode})`);
} else {
  console.log('[Version Sync] ⚠️  Android project not found');
}

// Update iOS version (Info.plist uses Xcode build settings)
// We'll update the project.pbxproj file
const iosProjectPath = path.join(__dirname, '../ios/App/App.xcodeproj/project.pbxproj');
if (fs.existsSync(iosProjectPath)) {
  let iosProject = fs.readFileSync(iosProjectPath, 'utf8');

  // Update MARKETING_VERSION (the display version)
  iosProject = iosProject.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);

  // Update CURRENT_PROJECT_VERSION (build number)
  iosProject = iosProject.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${versionCode};`);

  fs.writeFileSync(iosProjectPath, iosProject);
  console.log(`[Version Sync] ✅ Updated iOS: ${version} (${versionCode})`);
} else {
  console.log('[Version Sync] ⚠️  iOS project not found');
}

console.log('[Version Sync] 🎉 Version sync complete!');
