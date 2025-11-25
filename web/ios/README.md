# Glass iOS App

This directory contains the Glass iOS app built with Capacitor.

## 📱 Development Requirements

- macOS (required for iOS development)
- Xcode 15.0 or later
- CocoaPods
- Node.js 18 or later
- pnpm

## 🚀 Building and Running the iOS App

### 1. Build Web App

First, build the Next.js web app with static export:

```bash
cd /Users/jinho/Projects/glass/web
pnpm run cap:build
```

This command performs the following:

- Builds Next.js in static export mode with `CAPACITOR_BUILD=true` environment variable
- Generates build output in the `out` directory
- Runs `cap sync` to sync web resources to the native project

### 2. Open in Xcode

```bash
pnpm run cap:ios
```

Or directly:

```bash
npx cap open ios
```

### 3. Live Development Mode

To use the development server for real-time testing:

1. Start the Next.js development server:

```bash
pnpm dev
```

2. Update `capacitor.config.ts` to point to the local server:

```typescript
const config: CapacitorConfig = {
  // ... existing config
  server: {
    url: 'http://localhost:3000',
    cleartext: true,
  },
};
```

3. Run the app from Xcode

⚠️ **Important**: Remove the `server.url` setting before production builds!

### 4. Run in iOS Simulator

```bash
pnpm run ios:dev
```

## 🎨 Changing Icons and Splash Screens

### App Icon

1. Prepare a 1024x1024 PNG image
2. Open the project in Xcode
3. Select `App/App/Assets.xcassets/AppIcon.appiconset`
4. Drag and drop the images

Or use `@capacitor/assets` for automatic generation:

```bash
npm install -g @capacitor/assets
cd /Users/jinho/Projects/glass/web
# Create resources folder and add icon.png (1024x1024) in project root
capacitor-assets generate --ios
```

### Splash Screen

1. Select `App/App/Assets.xcassets/Splash.imageset` in Xcode
2. Replace with appropriately sized images (2732x2732 recommended)

## 🔧 Adding Native Features

When adding new Capacitor plugins:

1. Install the plugin:

```bash
pnpm add @capacitor/[plugin-name]
```

2. Sync to iOS:

```bash
pnpm run cap:sync
```

3. Reinstall CocoaPods (if needed):

```bash
cd ios/App
pod install
```

## 📝 Info.plist Permissions

Currently configured permissions:

- `NSMicrophoneUsageDescription` - Microphone access (voice recognition)
- `NSSpeechRecognitionUsageDescription` - Speech recognition
- `NSCameraUsageDescription` - Camera access
- `NSPhotoLibraryUsageDescription` - Photo library read
- `NSPhotoLibraryAddUsageDescription` - Photo library save
- `UIBackgroundModes` - Background audio

If you need additional permissions, modify `ios/App/App/Info.plist`.

## 🐛 Troubleshooting

### Pod install fails

```bash
cd ios/App
pod deintegrate
pod install
```

### Xcode build errors

1. Run `Product > Clean Build Folder` in Xcode
2. Delete `ios/App/Pods` and re-run `pod install`
3. Delete `DerivedData`:

```bash
rm -rf ~/Library/Developer/Xcode/DerivedData
```

### Web resources not updating

```bash
pnpm run cap:build
# or
pnpm run cap:sync
```

## 📱 App Store Deployment

1. Set Bundle Identifier in Xcode (`com.glass.app`)
2. Configure Development Team
3. Update Version and Build Number
4. Create Archive (`Product > Archive`)
5. Upload to App Store Connect

## 🔗 Useful Links

- [Capacitor Official Documentation](https://capacitorjs.com/)
- [iOS Deployment Guide](https://capacitorjs.com/docs/ios)
- [Capacitor Plugins](https://capacitorjs.com/docs/plugins)

## 📄 License

This project follows the license of the parent project.
