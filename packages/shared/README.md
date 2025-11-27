# @glass/shared

공통 타입, API 클라이언트, 유틸리티를 포함하는 공유 패키지입니다.

## 설치

```bash
npm install @glass/shared
```

## 사용법

### API Client

```typescript
import { GlassApiClient } from '@glass/shared';

const client = new GlassApiClient({
  baseUrl: 'https://api.example.com',
  getAuthToken: async () => {
    // Return auth token from storage
    return await getStoredToken();
  },
});

// Use the client
const partners = await client.fetchPartners();
const conversations = await client.fetchConversationSummaries();
```

### Types

```typescript
import type {
  UserProfile,
  ConversationPartner,
  ConversationSummary,
  Memory,
  LearningLevel,
} from '@glass/shared';

function displayUser(user: UserProfile) {
  console.log(`${user.name} (${user.email})`);
}
```

### Storage

```typescript
import { AuthStorage, StorageAdapter } from '@glass/shared';

// Implement platform-specific storage
class MyStorageAdapter implements StorageAdapter {
  async getItem(key: string): Promise<string | null> {
    // Platform-specific implementation
  }
  async setItem(key: string, value: string): Promise<void> {
    // Platform-specific implementation
  }
  async removeItem(key: string): Promise<void> {
    // Platform-specific implementation
  }
  async clear(): Promise<void> {
    // Platform-specific implementation
  }
}

const storage = new MyStorageAdapter();
const authStorage = new AuthStorage(storage);

// Use auth storage
await authStorage.setToken('abc123');
const token = await authStorage.getToken();
```

## API

### GlassApiClient

#### Conversations

- `createConversationSession(): Promise<string>`
- `fetchConversationSummaries(options?): Promise<ConversationListResponse>`
- `fetchConversationDetail(id: string): Promise<ConversationDetail>`
- `updateConversationTitle(id: string, title: string): Promise<ConversationSummary>`
- `deleteConversation(id: string): Promise<void>`
- `fetchConversationMemories(id: string): Promise<ConversationMemoriesResponse>`

#### Partners

- `fetchPartners(): Promise<ConversationPartner[]>`
- `createPartner(input: PartnerCreateInput): Promise<ConversationPartner>`
- `updatePartner(id: string, input: PartnerUpdateInput): Promise<ConversationPartner>`
- `deletePartner(id: string): Promise<void>`
- `uploadPartnerAvatar(id: string, file: File | Blob): Promise<ConversationPartner>`
- `startPartnerGeneration(input: PartnerPersonaCreateInput): Promise<PartnerGenerationJob>`
- `fetchPartnerGenerationJob(id: string): Promise<PartnerGenerationJob>`

#### Account

- `fetchAccountSnapshot(): Promise<AccountSnapshot>`
- `fetchOnboardingStatus(): Promise<OnboardingStatus>`
- `completeOnboarding(settings): Promise<OnboardingStatus>`
- `updateLanguageSettings(settings): Promise<...>`

#### Memories

- `fetchMemories(options?): Promise<MemoryListResponse>`
- `createMemories(memories): Promise<Memory[]>`
- `updateMemory(id: string, update): Promise<Memory>`
- `deleteMemory(id: string): Promise<void>`
- `bulkDeleteMemories(ids: string[]): Promise<BulkDeleteMemoriesResponse>`

#### Billing

- `createCheckoutSession(options?): Promise<CheckoutSession>`
- `createBillingPortalSession(options?): Promise<{ portalUrl: string }>`
- `createContactRequest(payload): Promise<{ success: boolean }>`

## Types

### Core Types

- `UserProfile` - 사용자 프로필
- `AccountSnapshot` - 계정 스냅샷
- `BillingSnapshot` - 구독 정보
- `OnboardingStatus` - 온보딩 상태

### Conversation Types

- `ConversationSummary` - 대화 요약
- `ConversationDetail` - 대화 상세
- `ConversationPartner` - 대화 파트너
- `ConversationScores` - 대화 점수

### Memory Types

- `Memory` - 메모리
- `MemoryListResponse` - 메모리 목록 응답

### Learning Types

- `LearningLevel` - 학습 레벨 ('zero' | 'beginner' | 'intermediate' | 'advanced')

## Platform Integration

### Web (Next.js)

```typescript
// lib/storage.ts
import { StorageAdapter } from '@glass/shared';

export class WebStorageAdapter implements StorageAdapter {
  async getItem(key: string) {
    return localStorage.getItem(key);
  }
  async setItem(key: string, value: string) {
    localStorage.setItem(key, value);
  }
  async removeItem(key: string) {
    localStorage.removeItem(key);
  }
  async clear() {
    localStorage.clear();
  }
}
```

### Mobile (React Native)

```typescript
// lib/storage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageAdapter } from '@glass/shared';

export class AsyncStorageAdapter implements StorageAdapter {
  async getItem(key: string) {
    return await AsyncStorage.getItem(key);
  }
  async setItem(key: string, value: string) {
    await AsyncStorage.setItem(key, value);
  }
  async removeItem(key: string) {
    await AsyncStorage.removeItem(key);
  }
  async clear() {
    await AsyncStorage.clear();
  }
}
```

## Development

```bash
# Type check
npm run typecheck
```

## License

See LICENSE file in the root of the repository.

