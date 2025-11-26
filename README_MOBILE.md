# Glass - Web & Mobile Monorepo

언어 학습 플랫폼 Glass의 웹과 모바일 애플리케이션입니다.

## 프로젝트 구조

```
glass/
├── packages/
│   ├── shared/          # 공통 코드 (types, API client, utils)
│   ├── mobile/          # React Native Expo 앱
│   └── web/             # Next.js 웹 앱
├── src/                 # Python 백엔드
└── ...
```

## 공통 패키지 (@glass/shared)

웹과 모바일에서 재사용 가능한 코드:

### 📦 주요 내용

- **Types**: TypeScript 타입 정의
  - 사용자, 대화, 파트너, 메모리 등
  - 모든 API 응답 타입
  
- **API Client**: 플랫폼 독립적인 API 클라이언트
  - `GlassApiClient`: 모든 API 호출을 처리
  - 자동 토큰 관리
  - snake_case ↔ camelCase 변환
  
- **Utils**: 유틸리티 함수
  - `StorageAdapter`: 플랫폼별 저장소 추상화
  - `AuthStorage`: 인증 토큰/사용자 정보 관리

### 사용 예시

```typescript
import { GlassApiClient, AuthStorage } from '@glass/shared';
import type { ConversationPartner, LearningLevel } from '@glass/shared';

// API 클라이언트 초기화
const apiClient = new GlassApiClient({
  baseUrl: 'https://api.example.com',
  getAuthToken: async () => await storage.getToken(),
});

// API 호출
const partners = await apiClient.fetchPartners();
const snapshot = await apiClient.fetchAccountSnapshot();
```

## 모바일 앱 (@glass/mobile)

React Native Expo 기반 모바일 애플리케이션

### 🚀 시작하기

```bash
cd packages/mobile
npm install
npm start
```

### 주요 기능

- ✅ 이메일/비밀번호 인증
- ✅ 언어 설정 온보딩
- ✅ 대화 파트너 관리
- ✅ 대화 기록 조회
- ✅ 메모리 관리
- ✅ 프로필 및 설정

### 기술 스택

- **Framework**: Expo SDK 52
- **Navigation**: Expo Router (file-based)
- **State**: React Query + Context API
- **Storage**: AsyncStorage
- **UI**: React Native 핵심 컴포넌트

### 화면 구조

```
app/
├── (auth)/              # 인증 플로우
│   ├── login.tsx
│   ├── signup.tsx
│   └── forgot-password.tsx
├── (app)/              # 메인 앱
│   ├── (tabs)/         # 탭 네비게이션
│   │   ├── index.tsx         # 홈
│   │   ├── partners.tsx      # 파트너 목록
│   │   ├── history.tsx       # 대화 기록
│   │   ├── memory.tsx        # 메모리
│   │   └── profile.tsx       # 프로필
│   └── onboarding.tsx  # 온보딩
└── index.tsx           # 엔트리 포인트
```

## 웹 앱 (packages/web/)

Next.js 웹 애플리케이션입니다.

### 공통 패키지 적용 방법

웹 앱에서도 공통 패키지를 사용하도록 업데이트할 수 있습니다:

```typescript
// 기존 코드
import { fetchPartners } from '@/lib/account-api';

// 공통 패키지 사용
import { useApi } from '@/contexts/api-context';

function Component() {
  const api = useApi();
  const partners = await api.fetchPartners();
}
```

## 개발 가이드

### 1. 공통 코드 수정

`packages/shared/`의 코드를 수정하면 웹과 모바일 모두 영향을 받습니다.

```bash
cd packages/shared
npm run typecheck  # TypeScript 검사
```

### 2. 새 API 엔드포인트 추가

1. `packages/shared/src/types/account.ts`에 타입 추가
2. `packages/shared/src/api/client.ts`에 메서드 추가
3. 웹/모바일에서 사용

### 3. 플랫폼별 기능

- **웹 전용**: `packages/web/` 디렉토리에 구현
- **모바일 전용**: `packages/mobile/` 디렉토리에 구현
- **공통 기능**: `packages/shared/` 디렉토리에 구현

## 코드 재사용 전략

### ✅ 재사용 가능 (shared)

- API 클라이언트 로직
- 타입 정의
- 비즈니스 로직
- 유틸리티 함수
- 데이터 변환 로직

### ❌ 플랫폼별 구현

- UI 컴포넌트 (웹: React/HTML, 모바일: React Native)
- 네비게이션 (웹: Next.js Router, 모바일: Expo Router)
- 스토리지 (웹: localStorage, 모바일: AsyncStorage)
- 인증 흐름 (웹: NextAuth, 모바일: Custom)

## 환경 변수

### 공통

```bash
# API Base URL
EXPO_PUBLIC_API_URL=http://localhost:8000  # 모바일
NEXT_PUBLIC_GLASS_API_URL=http://localhost:8000  # 웹
```

## 배포

### 모바일

```bash
# iOS
eas build --platform ios

# Android
eas build --platform android
```

### 웹

```bash
cd packages/web
npm run build
```

## 마이그레이션 가이드

기존 웹 앱을 공통 패키지로 마이그레이션하려면:

1. **타입 임포트 변경**
```typescript
// Before
import type { UserProfile } from '@/lib/account-api';

// After
import type { UserProfile } from '@glass/shared';
```

2. **API 호출 변경**
```typescript
// Before
import { fetchPartners } from '@/lib/account-api';
const partners = await fetchPartners(token);

// After
import { useApi } from '@/contexts/api-context';
const api = useApi();
const partners = await api.fetchPartners();
```

3. **Context 업데이트**
- `AccountSessionProvider`를 공통 API 클라이언트를 사용하도록 수정
- 기존 `account-api.ts`의 함수들을 `GlassApiClient` 메서드로 대체

## 라이선스

See LICENSE file.

