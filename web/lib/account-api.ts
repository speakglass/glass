export interface Usage {
  totalSeconds: number | null;
  remainingSeconds: number | null;
}

export interface UserProfile {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  trialMinutes?: number | null;
  createdAt: string;
  lastLoginAt?: string | null;
  learningLang?: string | null;
  nativeLang?: string | null;
  proficiency?: string | null;
  emailVerified: boolean;
}

export interface ConversationSummary {
  id: string;
  sessionId: string;
  title?: string | null;
  summary?: string | null;
  startedAt: Date;
  endedAt?: Date | null;
  durationSeconds?: number | null;
  learningLang?: string | null;
  nativeLang?: string | null;
  scores?: Record<string, unknown> | null;
}

export interface ConversationDetail extends ConversationSummary {
  messages?: Array<Record<string, unknown>>;
  extractedInfo?: Array<Record<string, unknown>> | null;
  feedback?: string | null;
}

export interface AccountSnapshot {
  user: UserProfile;
  usage: Usage;
  conversations: ConversationSummary[];
}

export interface OnboardingStatus {
  completed: boolean;
  completedAt?: string | null;
}

export interface Memory {
  id: string;
  name: string | null; // Edge name/type from Zep (e.g., "LIKES", "KNOWS")
  fact: string; // The actual fact text
  createdAt: Date | null;
  validAt: Date | null;
  invalidAt: Date | null;
  expiredAt: Date | null;
  // Computed fields
  label: string; // Formatted name for display
  status: 'active' | 'expired' | 'invalid';
}

export interface MemoryListResponse {
  items: Memory[];
  total: number;
  limit: number;
  offset: number;
}

export interface ZepMemory {
  id: string; // Zep edge UUID
  label: string;
  value: string;
  editable: boolean;
}

export interface ZepMemoriesResponse {
  memories: ZepMemory[];
  processing: boolean; // True if Zep is still processing
}

export interface ZepContextRange {
  start?: string | null;
  end?: string | null;
}

export interface ZepContextItem {
  type: 'fact' | 'entity' | 'episode' | 'unknown';
  label?: string | null;
  text: string;
  range?: ZepContextRange | null;
}

export interface ZepContextResponse {
  items: ZepContextItem[];
  rawContext?: string | null;
}

interface ZepContextResponseApi {
  items: {
    type: string;
    label?: string | null;
    text: string;
    range?: {
      start?: string | null;
      end?: string | null;
    } | null;
  }[];
  raw_context?: string | null;
}

type ConversationSummaryApi = {
  id: string;
  session_id: string;
  title?: string | null;
  summary?: string | null;
  started_at: string;
  ended_at?: string | null;
  duration_seconds?: number | null;
  learning_lang?: string | null;
  native_lang?: string | null;
  scores?: Record<string, unknown> | null;
};

type ConversationDetailApi = ConversationSummaryApi & {
  messages?: Array<Record<string, unknown>>;
  extracted_info?: Array<Record<string, unknown>> | null;
  feedback?: string | null;
};

type UserApi = {
  id: string;
  email: string;
  name?: string | null;
  avatar_url?: string | null;
  trial_minutes?: number | null;
  created_at: string;
  last_login_at?: string | null;
  learning_lang?: string | null;
  native_lang?: string | null;
  proficiency?: string | null;
  email_verified: boolean;
};

type UsageApi = {
  total_seconds: number | null;
  remaining_seconds: number | null;
};

interface AccountSnapshotApi {
  user: UserApi;
  usage: UsageApi;
  conversations?: ConversationSummaryApi[];
}

interface OnboardingStatusApi {
  completed: boolean;
  completed_at?: string | null;
}

interface CompleteOnboardingResponseApi {
  success: boolean;
  completed_at: string;
}

type MemoryApi = {
  id: string;
  name: string | null;
  fact: string;
  created_at: string | null;
  valid_at: string | null;
  invalid_at: string | null;
  expired_at: string | null;
};

interface MemoryListResponseApi {
  items: MemoryApi[];
  total: number;
  limit: number;
  offset: number;
}

export function getApiBase(): string {
  // Check if we're running on the server side (in Next.js API routes)
  const isServer = typeof window === 'undefined';

  if (isServer) {
    // On the server, prefer internal Docker network URL, fallback to public URL
    return process.env.GLASS_API_URL_INTERNAL || process.env.NEXT_PUBLIC_GLASS_API_URL || 'http://localhost:8000';
  } else {
    // On the client (browser), always use localhost or public URL
    // NEVER use Docker container names like 'http://api:8000'
    const publicUrl = process.env.NEXT_PUBLIC_GLASS_API_URL || '';

    // If the URL contains Docker container names, replace with localhost
    if (publicUrl.includes('://api:')) {
      console.warn('[accountApi] Detected Docker internal URL in browser context, using localhost instead');
      return 'http://localhost:8000';
    }

    return publicUrl || 'http://localhost:8000';
  }
}

function mapSummary(data: ConversationSummaryApi): ConversationSummary {
  return {
    id: data.id,
    sessionId: data.session_id,
    title: data.title,
    summary: data.summary,
    startedAt: new Date(data.started_at),
    endedAt: data.ended_at ? new Date(data.ended_at) : null,
    durationSeconds: data.duration_seconds,
    learningLang: data.learning_lang,
    nativeLang: data.native_lang,
    scores: data.scores,
  };
}

function mapDetail(data: ConversationDetailApi): ConversationDetail {
  const summary = mapSummary(data);
  return {
    ...summary,
    messages: data.messages,
    extractedInfo: data.extracted_info,
    feedback: data.feedback,
  };
}

function mapUser(data: UserApi): UserProfile {
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    avatarUrl: data.avatar_url,
    trialMinutes: data.trial_minutes,
    createdAt: data.created_at,
    lastLoginAt: data.last_login_at,
    learningLang: data.learning_lang,
    nativeLang: data.native_lang,
    proficiency: data.proficiency,
    emailVerified: data.email_verified,
  };
}

function mapUsage(data: UsageApi): Usage {
  return {
    totalSeconds: data.total_seconds,
    remainingSeconds: data.remaining_seconds,
  };
}

function mapMemory(data: MemoryApi): Memory {
  // Format label from edge name
  const label = data.name ? data.name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()) : 'Memory';

  // Compute status from Zep fields
  let status: 'active' | 'expired' | 'invalid' = 'active';
  if (data.expired_at) {
    status = 'expired';
  } else if (data.invalid_at) {
    status = 'invalid';
  }

  return {
    id: data.id,
    name: data.name,
    fact: data.fact,
    createdAt: data.created_at ? new Date(data.created_at) : null,
    validAt: data.valid_at ? new Date(data.valid_at) : null,
    invalidAt: data.invalid_at ? new Date(data.invalid_at) : null,
    expiredAt: data.expired_at ? new Date(data.expired_at) : null,
    label,
    status,
  };
}

async function authedFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const base = getApiBase();
  const headers = new Headers(init?.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  // Set Content-Type for POST/PUT/PATCH requests with body
  if (init?.body && (init?.method === 'POST' || init?.method === 'PUT' || init?.method === 'PATCH')) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  const url = `${base}${path}`;

  console.log('[accountApi] Fetching:', url);

  const response = await fetch(url, {
    ...init,
    headers,
    cache: 'no-store',
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[accountApi] Request failed:', {
      url,
      status: response.status,
      statusText: response.statusText,
      errorText,
    });

    // Throw error with status code for proper handling upstream
    const error = new Error(`Account API request failed (${response.status}): ${errorText}`) as Error & {
      status: number;
    };
    error.status = response.status;
    throw error;
  }

  // Handle 204 No Content responses (e.g., DELETE)
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function fetchAccountSnapshot(token: string): Promise<AccountSnapshot> {
  console.log('[accountApi] fetchAccountSnapshot called');
  try {
    const data = await authedFetch<AccountSnapshotApi>('/me', token);
    console.log('[accountApi] Account snapshot fetched successfully');
    return {
      user: mapUser(data.user),
      usage: mapUsage(data.usage),
      conversations: data.conversations ? data.conversations.map(mapSummary) : [],
    };
  } catch (error) {
    console.error('[accountApi] fetchAccountSnapshot error:', error);
    throw error;
  }
}

export interface ConversationListResponse {
  conversations: ConversationSummary[];
  total: number;
  limit: number;
  offset: number;
}

interface ConversationListResponseApi {
  conversations: ConversationSummaryApi[];
  total: number;
  limit: number;
  offset: number;
}

export async function fetchConversationSummaries(
  token: string,
  options?: { limit?: number; offset?: number; search?: string }
): Promise<ConversationListResponse> {
  const params = new URLSearchParams();
  params.set('limit', String(options?.limit || 20));
  params.set('offset', String(options?.offset || 0));
  if (options?.search) {
    params.set('search', options.search);
  }

  const data = await authedFetch<ConversationListResponseApi>(`/conversations?${params.toString()}`, token);
  return {
    conversations: data.conversations.map(mapSummary),
    total: data.total,
    limit: data.limit,
    offset: data.offset,
  };
}

export async function fetchConversationDetail(token: string, conversationId: string): Promise<ConversationDetail> {
  const data = await authedFetch<ConversationDetailApi>(`/conversations/${conversationId}`, token);
  return mapDetail(data);
}

export async function updateConversationTitle(
  token: string,
  conversationId: string,
  title: string
): Promise<ConversationSummary> {
  const data = await authedFetch<ConversationSummaryApi>(`/conversations/${conversationId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
  return mapSummary(data);
}

export async function deleteConversation(token: string, conversationId: string): Promise<void> {
  await authedFetch<void>(`/conversations/${conversationId}`, token, {
    method: 'DELETE',
  });
}

export async function fetchConversationZepMemories(
  token: string,
  conversationId: string
): Promise<ZepMemoriesResponse> {
  return await authedFetch<ZepMemoriesResponse>(`/conversations/${conversationId}/zep-memories`, token);
}

export async function fetchConversationZepContext(token: string, conversationId: string): Promise<ZepContextResponse> {
  const data = await authedFetch<ZepContextResponseApi>(`/conversations/${conversationId}/zep-context`, token);
  return {
    items:
      data.items?.map((item) => ({
        type: (item.type as ZepContextItem['type']) || 'unknown',
        label: item.label,
        text: item.text,
        range: item.range,
      })) ?? [],
    rawContext: data.raw_context ?? null,
  };
}

export async function fetchOnboardingStatus(token: string): Promise<OnboardingStatus> {
  const data = await authedFetch<OnboardingStatusApi>('/accounts/me/onboarding', token);
  return {
    completed: data.completed,
    completedAt: data.completed_at,
  };
}

export async function completeOnboarding(
  token: string,
  settings: {
    learningLang: string;
    nativeLang: string;
    proficiency: string;
  }
): Promise<OnboardingStatus> {
  const data = await authedFetch<CompleteOnboardingResponseApi>('/accounts/me/onboarding/complete', token, {
    method: 'POST',
    body: JSON.stringify({
      learning_lang: settings.learningLang,
      native_lang: settings.nativeLang,
      proficiency: settings.proficiency,
    }),
  });
  return {
    completed: true,
    completedAt: data.completed_at,
  };
}

interface UpdateLanguageSettingsResponseApi {
  success: boolean;
  learning_lang: string | null;
  native_lang: string | null;
  proficiency: string | null;
}

export async function updateLanguageSettings(
  token: string,
  settings: {
    learningLang?: string;
    nativeLang?: string;
    proficiency?: string;
  }
): Promise<{ learningLang?: string | null; nativeLang?: string | null; proficiency?: string | null }> {
  const body: Record<string, string> = {};
  if (settings.learningLang !== undefined) body.learning_lang = settings.learningLang;
  if (settings.nativeLang !== undefined) body.native_lang = settings.nativeLang;
  if (settings.proficiency !== undefined) body.proficiency = settings.proficiency;

  const data = await authedFetch<UpdateLanguageSettingsResponseApi>('/accounts/me/languages', token, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return {
    learningLang: data.learning_lang,
    nativeLang: data.native_lang,
    proficiency: data.proficiency,
  };
}

// ===== Memory API =====

export async function fetchMemories(
  token: string,
  options?: {
    limit?: number;
    offset?: number;
    status?: string;
    search?: string;
    includeZepFacts?: boolean; // Include auto-generated Zep facts
  }
): Promise<MemoryListResponse> {
  const params = new URLSearchParams();
  params.set('limit', String(options?.limit || 50));
  params.set('offset', String(options?.offset || 0));
  if (options?.status) {
    params.set('status', options.status);
  }
  if (options?.search) {
    params.set('search', options.search);
  }
  if (options?.includeZepFacts) {
    params.set('include_zep_facts', 'true');
  }

  const data = await authedFetch<MemoryListResponseApi>(`/memories?${params.toString()}`, token);
  return {
    items: data.items.map(mapMemory),
    total: data.total,
    limit: data.limit,
    offset: data.offset,
  };
}

export async function pinZepFact(token: string, zepFactId: string, value: string, label?: string): Promise<Memory> {
  const data = await authedFetch<MemoryApi>('/memories/pin-zep-fact', token, {
    method: 'POST',
    body: JSON.stringify({
      zep_fact_id: zepFactId,
      value,
      label,
    }),
  });
  return mapMemory(data);
}

export async function fetchMemory(token: string, memoryId: string): Promise<Memory> {
  const data = await authedFetch<MemoryApi>(`/memories/${memoryId}`, token);
  return mapMemory(data);
}

export async function createMemories(token: string, memories: Array<{ value: string }>): Promise<Memory[]> {
  const data = await authedFetch<MemoryApi[]>('/memories', token, {
    method: 'POST',
    body: JSON.stringify(memories),
  });
  return data.map(mapMemory);
}

export async function updateMemory(token: string, memoryId: string, update: { value?: string }): Promise<Memory> {
  const data = await authedFetch<MemoryApi>(`/memories/${memoryId}`, token, {
    method: 'PATCH',
    body: JSON.stringify(update),
  });
  return mapMemory(data);
}

export async function deleteMemory(token: string, memoryId: string): Promise<void> {
  await authedFetch<void>(`/memories/${memoryId}`, token, {
    method: 'DELETE',
  });
}

export async function bulkDeleteMemories(token: string, memoryIds: string[]): Promise<{ deleted: number }> {
  return await authedFetch<{ deleted: number }>('/memories/bulk-delete', token, {
    method: 'POST',
    body: JSON.stringify({ memory_ids: memoryIds }),
  });
}
