# Capacitor iOS App Setup Complete

The Glass web project has been successfully converted to a native iOS app! 🎉

## ✅ Completed Tasks

### 1. Capacitor Package Installation

- `@capacitor/core` (v7.4.4)
- `@capacitor/cli` (v7.4.4)
- `@capacitor/ios` (v7.4.4)
- `@capacitor/app` (v7.1.0)
- `@capacitor/haptics` (v7.0.2)
- `@capacitor/keyboard` (v7.0.3)
- `@capacitor/status-bar` (v7.0.3)

### 2. Capacitor Configuration File

- Created `capacitor.config.ts`
- App ID: `com.glass.app`
- App Name: `Glass`
- Web Directory: `out`

### 3. Next.js Static Export 설정

- 환경변수 기반 조건부 static export 설정 (`CAPACITOR_BUILD`)
- 이미지 최적화 비활성화 (static export용)
- 웹 버전에는 영향 없음 ✅

### 4. iOS 네이티브 프로젝트 생성

- iOS 플랫폼 추가 완료
- Xcode 프로젝트 생성됨 (`ios/App/`)
- CocoaPods 의존성 설치 완료

### 5. iOS 권한 설정

`ios/App/App/Info.plist`에 다음 권한 추가:

- 마이크 액세스 (음성 대화용)
- 음성 인식
- 카메라
- 사진 라이브러리 읽기/쓰기
- 백그라운드 오디오

### 6. 네이티브 기능 통합

- `lib/capacitor.ts` 헬퍼 유틸리티 생성
- `components/app-providers.tsx`에 네이티브 기능 초기화 추가
- 웹과 네이티브 환경 자동 감지 및 분기 처리

### 7. 빌드 스크립트 추가

`package.json`에 새로운 스크립트:

```json
{
  "cap:build": "CAPACITOR_BUILD=true next build && cap sync",
  "cap:ios": "cap open ios",
  "cap:sync": "cap sync",
  "ios:dev": "cap run ios"
}
```

### 8. Git 설정 업데이트

`.gitignore`에 iOS 관련 파일 패턴 추가:

- `ios/App/Pods/`
- Xcode 사용자 데이터
- DerivedData
- 빌드 아티팩트

### 9. 문서화

- `ios/README.md` - iOS 앱 개발 가이드
- `web/README.md` 업데이트 - iOS 앱 섹션 추가
- 이 파일 - 설정 완료 요약

## 🚀 Next Steps

### 1. Build and Test iOS App

```bash
cd /Users/jinho/Projects/glass/web

# Option 1: Build with Static Export
pnpm run cap:build
pnpm run cap:ios

# Option 2: Development Mode (Recommended)
# 1. Configure server.url in capacitor.config.ts
# 2. Run dev server with pnpm dev
# 3. Run app from Xcode
```

### 2. Xcode Configuration

1. Open project in Xcode
2. In **Signing & Capabilities** tab:
   - Select your Team
   - Verify Bundle Identifier (`com.glass.app`)
3. Select simulator or physical device
4. Click Run button ▶️

### 3. Next.js + next-auth Considerations

⚠️ **Important**: This project uses `next-auth`.

- **Static Export**: next-auth requires server-side functionality, so it's not fully compatible with static export.
- **Recommended Approach**: Use local development server for development and testing.
- **Production Options**:
  - Option 1: Separate API routes to a backend and call APIs directly from iOS app
  - Option 2: Use Capacitor's `CapacitorHttp` plugin for authentication
  - Option 3: Implement mobile-specific auth flow (e.g., OAuth)

### 4. Additional Native Plugins (Optional)

Install additional plugins as needed:

```bash
# Splash Screen
pnpm add @capacitor/splash-screen

# Camera
pnpm add @capacitor/camera

# File System
pnpm add @capacitor/filesystem

# Share
pnpm add @capacitor/share

# Network Status
pnpm add @capacitor/network

# Toast Notifications
pnpm add @capacitor/toast

# Sync after installation
pnpm run cap:sync
cd ios/App && pod install
```

### 5. Customize App Icon and Splash Screen

Default icons are currently set. To customize:

**Option 1: Manual Change in Xcode**

1. Prepare 1024x1024 PNG image
2. Select `App/App/Assets.xcassets/AppIcon.appiconset` in Xcode
3. Drag and drop images

**Option 2: Auto-generate (@capacitor/assets)**

```bash
npm install -g @capacitor/assets

# Create resources folder in project root
mkdir -p resources
# Add icon.png (1024x1024)
# Add splash.png (2732x2732)

# Auto-generate all sizes
capacitor-assets generate --ios
```

### 6. Testing Checklist

- [ ] App runs successfully in simulator
- [ ] Microphone permission prompt works correctly
- [ ] Voice conversation features work
- [ ] Native features (Haptic, StatusBar, etc.) function properly
- [ ] App icon displays correctly
- [ ] Splash screen displays correctly
- [ ] Test on physical iOS device

### 7. App Store Deployment Preparation

1. **Bundle Identifier**: Use or modify `com.glass.app`
2. **Version & Build Number**: Set in Xcode
3. **App Store Connect** account ready
4. **Create Archive**: `Product > Archive` in Xcode
5. **TestFlight Deployment** (for beta testing)
6. **Submit to App Store**

## 📚 Useful Resources

- [Capacitor Documentation](https://capacitorjs.com/)
- [iOS Deployment Guide](https://capacitorjs.com/docs/ios)
- [Capacitor Plugins](https://capacitorjs.com/docs/plugins)
- [Next.js Static Export](https://nextjs.org/docs/app/building-your-application/deploying/static-exports)
- [Apple Developer Portal](https://developer.apple.com/)

## 🔄 Impact on Web Version

✅ **No impact on the web version!**

- All native features are conditionally executed through platform detection
- Without the `CAPACITOR_BUILD` environment variable, it builds as a regular Next.js app
- Existing build and deployment processes remain unchanged

```bash
# Web version build (unchanged)
pnpm build
pnpm start

# iOS app build (new method)
pnpm run cap:build
```

## 🎯 Summary

The Glass web project is now a **multi-platform application**:

- 🌐 **Web**: Deploy as regular web app with Next.js
- 📱 **iOS**: Deploy as native iOS app with Capacitor
- 🤖 **Android**: (Can utilize existing android folder)

A complete hybrid app structure that shares the entire codebase while leveraging native features! 🎊

## ⚠️ Known Issues and Limitations

1. **next-auth**: Not compatible with static export → Use dev server mode or modify auth logic
2. **Server Components**: Static export may be limited with some Next.js 15+ features
3. **API Routes**: Don't work with static export → Need to use separate backend API

## 📞 Support and Contact

If you encounter issues or need help:

- [Capacitor Discord](https://discord.com/invite/UPYYRhtyzp)
- [GitHub Issues](https://github.com/speakglass/glass/issues)

---

**Completed**: November 25, 2025  
**Capacitor Version**: 7.4.4  
**Next.js Version**: 16.0.1
