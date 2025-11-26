# Glass Mobile App 설정 가이드

## 전제 조건

- Node.js 18 이상
- npm 또는 yarn
- iOS: Xcode (macOS만)
- Android: Android Studio
- Expo Go 앱 (테스트용)

## 1. 프로젝트 클론 및 설치

```bash
# 프로젝트 클론
git clone https://github.com/speakglass/glass.git
cd glass

# 공통 패키지 설치
cd packages/shared
npm install

# 모바일 앱 설치
cd ../mobile
npm install
```

## 2. 환경 설정

### 환경 변수 설정

```bash
cd packages/mobile
cp .env.example .env
```

`.env` 파일을 열고 API URL 설정:

```bash
# 로컬 개발
EXPO_PUBLIC_API_URL=http://localhost:8000

# 또는 실제 서버
EXPO_PUBLIC_API_URL=https://api.yourdomain.com
```

### iOS 시뮬레이터 사용 시

로컬 API 서버 접근을 위해 `localhost` 대신 실제 IP 주소 사용:

```bash
# Mac의 IP 주소 확인
ipconfig getifaddr en0

# .env 업데이트
EXPO_PUBLIC_API_URL=http://192.168.1.100:8000
```

## 3. 개발 서버 시작

```bash
cd packages/mobile
npm start
```

이제 다음 옵션들이 표시됩니다:

- `i` - iOS 시뮬레이터에서 열기
- `a` - Android 에뮬레이터에서 열기
- `w` - 웹 브라우저에서 열기
- `r` - 새로고침

## 4. 물리적 디바이스에서 테스트

### iOS (iPhone/iPad)

1. App Store에서 "Expo Go" 설치
2. 카메라 앱으로 터미널의 QR 코드 스캔
3. "Open with Expo Go" 탭

### Android

1. Google Play에서 "Expo Go" 설치
2. Expo Go 앱 내에서 QR 코드 스캔
3. 앱이 자동으로 로드됩니다

## 5. 백엔드 서버 설정

모바일 앱이 제대로 작동하려면 Glass API 서버가 실행 중이어야 합니다:

```bash
# 프로젝트 루트에서
cd glass
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 데이터베이스 마이그레이션
alembic upgrade head

# 서버 시작
uvicorn glass.app:app --reload --host 0.0.0.0 --port 8000
```

## 6. 문제 해결

### "Network request failed" 에러

- `.env`의 API URL이 올바른지 확인
- iOS 시뮬레이터: `localhost` 대신 Mac IP 주소 사용
- Android 에뮬레이터: `10.0.2.2:8000` 사용 (localhost의 특별한 주소)
- 방화벽에서 8000 포트 허용 확인

### Expo Go에서 "Something went wrong" 에러

```bash
# 캐시 삭제 후 재시작
npm start -- --clear
```

### iOS에서 연결 안 됨

- Mac과 iPhone이 같은 WiFi 네트워크에 있는지 확인
- 방화벽 설정 확인

### Android 빌드 에러

```bash
# Android SDK 업데이트
cd ~/Android/Sdk
./tools/bin/sdkmanager --update

# Expo 프로젝트 재생성
cd packages/mobile
rm -rf node_modules
npm install
```

## 7. 다음 단계

### 프로덕션 빌드

```bash
# Expo Application Services 설정
npm install -g eas-cli
eas login
eas build:configure

# iOS 빌드
eas build --platform ios

# Android 빌드
eas build --platform android
```

### 앱 스토어 제출

1. **iOS (App Store)**
   - Apple Developer Program 가입 필요 ($99/년)
   - App Store Connect에서 앱 생성
   - `eas submit --platform ios`

2. **Android (Play Store)**
   - Google Play Developer 가입 필요 ($25 일회성)
   - Play Console에서 앱 생성
   - `eas submit --platform android`

## 8. 유용한 명령어

```bash
# 타입 체크
npm run typecheck

# 린팅
npm run lint

# 특정 플랫폼만 시작
npm run ios
npm run android
npm run web

# 프로덕션 미리보기
npx expo start --no-dev --minify
```

## 9. 개발 팁

### Hot Reload

코드를 수정하면 자동으로 앱이 새로고침됩니다. 빠른 개발을 위해 Fast Refresh 활성화:

- 설정 → Developer Menu → Enable Fast Refresh

### React Native Debugger

```bash
# Chrome DevTools 사용
# 디바이스를 흔들거나 ⌘D (iOS) / ⌘M (Android)
# "Debug Remote JS" 선택
```

### VS Code 확장 프로그램

권장 확장:
- React Native Tools
- Expo Tools
- ESLint
- Prettier

## 10. 추가 리소스

- [Expo 문서](https://docs.expo.dev/)
- [React Native 문서](https://reactnative.dev/)
- [Expo Router 문서](https://expo.github.io/router/)
- [React Query 문서](https://tanstack.com/query/latest)

## 지원

문제가 있으면 이슈를 열어주세요:
https://github.com/speakglass/glass/issues

