# Assets

This directory contains images, fonts, and other static assets for the mobile app.

## Required Files

You need to add the following files for the app to work properly:

### Images

- `icon.png` - App icon (1024x1024)
- `splash.png` - Splash screen image
- `adaptive-icon.png` - Android adaptive icon (1024x1024)
- `favicon.png` - Web favicon

### Generating Assets

You can use [Expo's asset generator](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/) or create your own.

#### Quick Setup

1. Create a simple icon (1024x1024 PNG)
2. Use Expo's automatic generation:

```bash
npx expo prebuild
```

#### Manual Setup

If you want to create them manually:

1. **icon.png**: Your app icon (1024x1024)
2. **splash.png**: Splash screen with your logo/brand
3. **adaptive-icon.png**: Same as icon.png for Android
4. **favicon.png**: Small icon for web (48x48 or 96x96)

## Directory Structure

```
assets/
├── icon.png
├── splash.png
├── adaptive-icon.png
├── favicon.png
└── images/          # Additional images
    └── ...
```

## Usage in Code

```typescript
import { Image } from 'react-native';

// Using require
<Image source={require('@/assets/images/logo.png')} />

// Using URI (for remote images)
<Image source={{ uri: 'https://...' }} />
```

## Notes

- Keep images optimized for performance
- Use appropriate formats: PNG for logos/icons, JPEG for photos
- Consider using SVG (via react-native-svg) for scalable graphics
