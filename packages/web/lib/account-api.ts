import type { LearningLevel } from '@/types/learning-level';
import { isLearningLevel } from '@/types/learning-level';

export interface UserProfile {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
  lastLoginAt?: string | null;
  learningLang?: string | null;
  nativeLang?: string | null;
  languageLevel?: LearningLevel | null;
  emailVerified: boolean;
  subscriptionStatus?: string | null;
  subscriptionPlan?: string | null;
  subscriptionInterval?: string | null;
  subscriptionCurrentPeriodEnd?: string | null;
  subscriptionCancelAt?: string | null;
  subscriptionCancelAtPeriodEnd?: boolean | null;
  billingExempt?: boolean;
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
  scores?: ConversationScores | null;
  partnerId?: string | null;
  partner?: ConversationPartnerRef | null;
}

export interface ConversationPartnerRef {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  descriptionTranslation?: string | null;
  avatarUrl?: string | null;
  voiceId?: string | null;
  learningLang?: string | null;
  nativeLang?: string | null;
  kind?: 'roleplay' | 'live_call' | null;
}

export interface ConversationMessage {
  id?: number | null;
  text: string;
  source?: string | null;
  utterance_id?: string | null;
  translation?: string | null;
  start?: number | null;
  duration?: number | null;
  event_type?: string | null;
  role?: string | null;
  partner_id?: string | null;
}

export interface ConversationFeedbackItem {
  messageId?: number | null;
  utteranceId?: string | null;
  text?: string | null;
  suggestedText?: string | null;
  originalText?: string | null;
  feedbackType?: string | null;
  severity?: string | null;
  spanStart?: number | null;
  spanEnd?: number | null;
  isOverall?: boolean | null;
}

export interface ConversationDetail extends ConversationSummary {
  messages?: ConversationMessage[];
  feedback?: string | null;
  memories: Memory[];
  feedbackItems?: ConversationFeedbackItem[];
}

export interface ConversationScores {
  fluency: number;
  accuracy: number;
  comprehensibility: number;
  overall?: number | null;
}

export interface ConversationPartner {
  id: string;
  name: string;
  description?: string | null;
  descriptionTranslation?: string | null;
  avatarUrl?: string | null;
  voiceId?: string | null;
  learningLang?: string | null;
  nativeLang?: string | null;
  kind: 'roleplay' | 'live_call';
  personaAge?: string | null;
  personaGender?: string | null;
  personaOccupation?: string | null;
  personaOccupationTranslation?: string | null;
  personaCity?: string | null;
  personaCityTranslation?: string | null;
  personaCountry?: string | null;
  personaCountryTranslation?: string | null;
  personaRelationship?: string | null;
  personaBackground?: string | null;
  personaBackgroundTranslation?: string | null;
  personaInterests?: string | null;
  personaInterestsTranslation?: string | null;
  conversationCount?: number;
}

export interface ConversationLimitSnapshot {
  enabled: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
  blocked: boolean;
}

export interface AccountLimitsSnapshot {
  conversations?: ConversationLimitSnapshot | null;
  partners?: ConversationLimitSnapshot | null;
}

export interface AccountSnapshot {
  user: UserProfile;
  billing: BillingSnapshot;
  limits?: AccountLimitsSnapshot | null;
}

export interface CheckoutSession {
  checkoutUrl: string;
  sessionId: string;
  plan: string;
}

export interface BillingSnapshot {
  enabled: boolean;
  active: boolean;
  selfHosted: boolean;
  billingExempt: boolean;
  status?: string | null;
  plan?: string | null;
  planInterval?: string | null;
  currentPeriodEnd?: string | null;
  cancelAt?: string | null;
  cancelAtPeriodEnd?: boolean | null;
}

export interface OnboardingStatus {
  completed: boolean;
  completedAt?: string | null;
}

export interface Memory {
  id: string;
  text: string;
  category: string;
  retention: string;
  scope?: string | null;
  importance?: number | null;
  partnerId?: string | null;
  conversationId?: string | null;
  summary?: string | null;
  retentionExpiresAt?: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export interface MemoryListResponse {
  items: Memory[];
  total: number;
  limit: number;
  offset: number;
}

export interface ConversationMemoriesResponse {
  memories: Memory[];
  processing: boolean; // True if extraction is still processing
}

interface ConversationCreateResponseApi {
  conversation_id: string;
}

interface ConversationMemoriesResponseApi {
  memories: MemoryApi[];
  processing: boolean;
}

type ConversationScoresApi = {
  fluency?: number | null;
  accuracy?: number | null;
  comprehensibility?: number | null;
  overall?: number | null;
};

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
  scores?: ConversationScoresApi | null;
  partner_id?: string | null;
  partner?: ConversationPartnerRefApi | null;
};

type ConversationDetailApi = ConversationSummaryApi & {
  messages?: Array<Record<string, unknown>>;
  feedback?: string | null;
  memories?: MemoryApi[] | null;
  feedback_items?: ConversationFeedbackItemApi[] | null;
};

type ConversationPartnerRefApi = {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  description_translation?: string | null;
  avatar_url?: string | null;
  voice_id?: string | null;
  learning_lang?: string | null;
  native_lang?: string | null;
  kind?: 'roleplay' | 'live_call' | null;
};

type ConversationFeedbackItemApi = {
  message_id?: number | null;
  utterance_id?: string | null;
  text?: string | null;
  suggested_text?: string | null;
  original_text?: string | null;
  feedback_type?: string | null;
  severity?: string | null;
  span_start?: number | null;
  span_end?: number | null;
  is_overall?: boolean | null;
};

type UserApi = {
  id: string;
  email: string;
  name?: string | null;
  avatar_url?: string | null;
  created_at: string;
  last_login_at?: string | null;
  learning_lang?: string | null;
  native_lang?: string | null;
  language_level?: string | null;
  email_verified: boolean;
  subscription_status?: string | null;
  subscription_plan?: string | null;
  subscription_interval?: string | null;
  subscription_current_period_end?: string | null;
  subscription_cancel_at?: string | null;
  subscription_cancel_at_period_end?: boolean | null;
  billing_exempt?: boolean | null;
};

interface ConversationLimitSnapshotApi {
  enabled: boolean;
  limit?: number | null;
  used: number;
  remaining?: number | null;
  blocked: boolean;
}

interface AccountLimitsSnapshotApi {
  conversations?: ConversationLimitSnapshotApi | null;
  partners?: ConversationLimitSnapshotApi | null;
}

interface AccountSnapshotApi {
  user: UserApi;
  billing: BillingSnapshotApi;
  limits?: AccountLimitsSnapshotApi | null;
}

interface CheckoutSessionResponseApi {
  checkout_url: string;
  session_id: string;
  plan: string;
}

interface BillingPortalSessionResponseApi {
  portal_url: string;
}

interface BillingSnapshotApi {
  enabled: boolean;
  active: boolean;
  self_hosted: boolean;
  billing_exempt: boolean;
  status?: string | null;
  plan?: string | null;
  plan_interval?: string | null;
  current_period_end?: string | null;
  cancel_at?: string | null;
  cancel_at_period_end?: boolean | null;
}

type PartnerApi = {
  id: string;
  name: string;
  description?: string | null;
  description_translation?: string | null;
  avatar_url?: string | null;
  voice_id?: string | null;
  learning_lang?: string | null;
  native_lang?: string | null;
  kind?: 'roleplay' | 'live_call';
  persona_age?: string | null;
  persona_gender?: string | null;
  persona_occupation?: string | null;
  persona_occupation_translation?: string | null;
  persona_city?: string | null;
  persona_city_translation?: string | null;
  persona_country?: string | null;
  persona_country_translation?: string | null;
  persona_relationship?: string | null;
  persona_background?: string | null;
  persona_background_translation?: string | null;
  persona_interests?: string | null;
  persona_interests_translation?: string | null;
  conversation_count?: number;
};

interface PartnerListApi {
  partners: PartnerApi[];
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
  text: string;
  category: string;
  retention: string;
  scope?: string | null;
  importance?: number | null;
  partner_id?: string | null;
  conversation_id?: string | null;
  summary?: string | null;
  retention_expires_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
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

function mapScores(data?: ConversationScoresApi | null): ConversationScores | null {
  if (!data) {
    return null;
  }
  return {
    fluency: typeof data.fluency === 'number' ? data.fluency : 0,
    accuracy: typeof data.accuracy === 'number' ? data.accuracy : 0,
    comprehensibility: typeof data.comprehensibility === 'number' ? data.comprehensibility : 0,
    overall: typeof data.overall === 'number' ? data.overall : null,
  };
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
    scores: mapScores(data.scores),
    partnerId: data.partner_id,
    partner: mapPartnerRef(data.partner),
  };
}

function mapPartnerRef(data?: ConversationPartnerRefApi | null): ConversationPartnerRef | null {
  if (!data) {
    return null;
  }
  const normalizedKind =
    data.kind === 'live_call' ? 'live_call' : data.kind === 'roleplay' ? 'roleplay' : data.voice_id ? 'roleplay' : null;
  return {
    id: data.id ?? null,
    name: data.name ?? null,
    description: data.description ?? null,
    descriptionTranslation: data.description_translation ?? null,
    avatarUrl: data.avatar_url ?? null,
    voiceId: data.voice_id ?? null,
    learningLang: data.learning_lang ?? null,
    nativeLang: data.native_lang ?? null,
    kind: normalizedKind,
  };
}

function mapFeedbackItem(data: ConversationFeedbackItemApi): ConversationFeedbackItem {
  return {
    messageId: typeof data.message_id === 'number' ? data.message_id : null,
    utteranceId: data.utterance_id ?? null,
    text: data.text ?? null,
    suggestedText: data.suggested_text ?? null,
    originalText: data.original_text ?? null,
    feedbackType: data.feedback_type ?? null,
    severity: data.severity ?? null,
    spanStart: typeof data.span_start === 'number' ? data.span_start : null,
    spanEnd: typeof data.span_end === 'number' ? data.span_end : null,
    isOverall: data.is_overall ?? null,
  };
}

function mapDetail(data: ConversationDetailApi): ConversationDetail {
  const summary = mapSummary(data);
  return {
    ...summary,
    messages: (data.messages as ConversationMessage[] | undefined) ?? [],
    feedback: data.feedback,
    memories: Array.isArray(data.memories) ? data.memories.map(mapMemory) : [],
    feedbackItems: Array.isArray(data.feedback_items) ? data.feedback_items.map(mapFeedbackItem) : [],
  };
}

function mapPartner(data: PartnerApi): ConversationPartner {
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    descriptionTranslation: data.description_translation || null,
    avatarUrl: data.avatar_url || null,
    voiceId: data.voice_id || null,
    learningLang: data.learning_lang || null,
    nativeLang: data.native_lang || null,
    kind: data.kind === 'live_call' ? 'live_call' : 'roleplay',
    personaAge: data.persona_age || null,
    personaGender: data.persona_gender || null,
    personaOccupation: data.persona_occupation || null,
    personaOccupationTranslation: data.persona_occupation_translation || null,
    personaCity: data.persona_city || null,
    personaCityTranslation: data.persona_city_translation || null,
    personaCountry: data.persona_country || null,
    personaCountryTranslation: data.persona_country_translation || null,
    personaRelationship: data.persona_relationship || null,
    personaBackground: data.persona_background || null,
    personaBackgroundTranslation: data.persona_background_translation || null,
    personaInterests: data.persona_interests || null,
    personaInterestsTranslation: data.persona_interests_translation || null,
    conversationCount: data.conversation_count ?? 0,
  };
}

function mapPartnerPersonaPreview(data?: PartnerPersonaPreviewApi | null): PartnerPersonaPreview | undefined {
  if (!data) {
    return undefined;
  }
  return {
    name: data.name ?? undefined,
    summary: data.summary ?? undefined,
    summaryTranslation: data.summary_translation ?? undefined,
    personaAge: data.persona_age ?? undefined,
    personaGender: data.persona_gender ?? undefined,
    personaOccupation: data.persona_occupation ?? undefined,
    personaOccupationTranslation: data.persona_occupation_translation ?? undefined,
    personaCity: data.persona_city ?? undefined,
    personaCityTranslation: data.persona_city_translation ?? undefined,
    personaCountry: data.persona_country ?? undefined,
    personaCountryTranslation: data.persona_country_translation ?? undefined,
    personaBackground: data.persona_background ?? undefined,
    personaInterests: data.persona_interests ?? undefined,
    personaBackgroundTranslation: data.persona_background_translation ?? undefined,
    personaInterestsTranslation: data.persona_interests_translation ?? undefined,
  };
}

function mapPartnerGenerationJob(data: PartnerGenerationJobApi): PartnerGenerationJob {
  return {
    id: data.job_id,
    status: data.status,
    message: data.message ?? undefined,
    stepsCompleted: data.steps_completed ?? [],
    personaPreview: mapPartnerPersonaPreview(data.persona_preview),
    partner: data.partner ? mapPartner(data.partner) : undefined,
    error: data.error ?? undefined,
  };
}

function mapUser(data: UserApi): UserProfile {
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    avatarUrl: data.avatar_url,
    createdAt: data.created_at,
    lastLoginAt: data.last_login_at,
    learningLang: data.learning_lang,
    nativeLang: data.native_lang,
    languageLevel: isLearningLevel(data.language_level) ? data.language_level : null,
    emailVerified: data.email_verified,
    subscriptionStatus: data.subscription_status ?? null,
    subscriptionPlan: data.subscription_plan ?? null,
    subscriptionInterval: data.subscription_interval ?? null,
    subscriptionCurrentPeriodEnd: data.subscription_current_period_end ?? null,
    subscriptionCancelAt: data.subscription_cancel_at ?? null,
    subscriptionCancelAtPeriodEnd: data.subscription_cancel_at_period_end ?? null,
    billingExempt: Boolean(data.billing_exempt),
  };
}

function mapBilling(data: BillingSnapshotApi | undefined): BillingSnapshot {
  if (!data) {
    return {
      enabled: false,
      active: true,
      selfHosted: true,
      billingExempt: true,
      status: null,
      plan: null,
      planInterval: null,
      currentPeriodEnd: null,
      cancelAt: null,
      cancelAtPeriodEnd: null,
    };
  }
  return {
    enabled: data.enabled,
    active: data.active,
    selfHosted: data.self_hosted,
    billingExempt: data.billing_exempt,
    status: data.status ?? null,
    plan: data.plan ?? null,
    planInterval: data.plan_interval ?? null,
    currentPeriodEnd: data.current_period_end ?? null,
    cancelAt: data.cancel_at ?? null,
    cancelAtPeriodEnd: data.cancel_at_period_end ?? null,
  };
}

function mapLimitSnapshot(entry: ConversationLimitSnapshotApi | null | undefined): ConversationLimitSnapshot | null {
  if (!entry) {
    return null;
  }
  return {
    enabled: Boolean(entry.enabled),
    limit: entry.limit ?? null,
    used: entry.used ?? 0,
    remaining: entry.remaining ?? null,
    blocked: Boolean(entry.blocked),
  };
}

function mapLimits(data: AccountLimitsSnapshotApi | null | undefined): AccountLimitsSnapshot | null {
  if (!data) return null;
  const conversations = mapLimitSnapshot(data.conversations);
  const partners = mapLimitSnapshot(data.partners);
  return {
    conversations,
    partners,
  };
}

function mapMemory(data: MemoryApi): Memory {
  return {
    id: data.id,
    text: data.text,
    category: data.category,
    retention: data.retention,
    scope: data.scope ?? null,
    importance: data.importance ?? null,
    partnerId: data.partner_id ?? null,
    conversationId: data.conversation_id ?? null,
    summary: data.summary ?? null,
    retentionExpiresAt: data.retention_expires_at ? new Date(data.retention_expires_at) : null,
    createdAt: data.created_at ? new Date(data.created_at) : null,
    updatedAt: data.updated_at ? new Date(data.updated_at) : null,
  };
}

async function authedFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const base = getApiBase();
  const headers = new Headers(init?.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  const isFormDataBody = typeof FormData !== 'undefined' && init?.body instanceof FormData;

  // Set Content-Type for POST/PUT/PATCH requests with body
  if (
    init?.body &&
    (init?.method === 'POST' || init?.method === 'PUT' || init?.method === 'PATCH') &&
    !isFormDataBody
  ) {
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

export async function createConversationSession(token: string): Promise<string> {
  const data = await authedFetch<ConversationCreateResponseApi>('/conversations/new', token, {
    method: 'POST',
  });
  return data.conversation_id;
}

export async function fetchAccountSnapshot(token: string): Promise<AccountSnapshot> {
  console.log('[accountApi] fetchAccountSnapshot called');
  try {
    const data = await authedFetch<AccountSnapshotApi>('/me', token);
    console.log('[accountApi] Account snapshot fetched successfully');
    return {
      user: mapUser(data.user),
      billing: mapBilling(data.billing),
      limits: mapLimits(data.limits),
    };
  } catch (error) {
    console.error('[accountApi] fetchAccountSnapshot error:', error);
    throw error;
  }
}

export type BillingPlanKey = 'monthly' | 'yearly';

export async function createCheckoutSession(
  token: string,
  options?: { plan?: BillingPlanKey; successUrl?: string; cancelUrl?: string }
): Promise<CheckoutSession> {
  const body: Record<string, string> = {
    plan: options?.plan ?? 'monthly',
  };
  if (options?.successUrl) {
    body.success_url = options.successUrl;
  }
  if (options?.cancelUrl) {
    body.cancel_url = options.cancelUrl;
  }

  const data = await authedFetch<CheckoutSessionResponseApi>('/billing/checkout', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return {
    checkoutUrl: data.checkout_url,
    sessionId: data.session_id,
    plan: data.plan,
  };
}

export async function createBillingPortalSession(
  token: string,
  options?: { returnUrl?: string }
): Promise<{ portalUrl: string }> {
  const body: Record<string, string> = {};
  if (options?.returnUrl) {
    body.return_url = options.returnUrl;
  }
  const data = await authedFetch<BillingPortalSessionResponseApi>('/billing/portal', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return {
    portalUrl: data.portal_url,
  };
}

export async function createContactRequest(
  token: string,
  payload: { name: string; email: string; company?: string; companySize?: string; message: string }
): Promise<{ success: boolean }> {
  const body = {
    name: payload.name,
    email: payload.email,
    company: payload.company ?? '',
    company_size: payload.companySize ?? '',
    message: payload.message,
  };
  const data = await authedFetch<{ success: boolean }>('/contact', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return data;
}

export interface PartnerCreateInput {
  name: string;
  description?: string | null;
  descriptionTranslation?: string | null;
  learningLang?: string | null;
  nativeLang?: string | null;
  avatarUrl?: string | null;
  personaAge?: string | null;
  personaGender?: string | null;
  personaOccupation?: string | null;
  personaOccupationTranslation?: string | null;
  personaCity?: string | null;
  personaCityTranslation?: string | null;
  personaCountry?: string | null;
  personaCountryTranslation?: string | null;
  personaRelationship?: string | null;
  personaBackground?: string | null;
  personaBackgroundTranslation?: string | null;
  personaInterests?: string | null;
  personaInterestsTranslation?: string | null;
}

export interface PartnerPersonaCreateInput {
  learningLang?: string | null;
  nativeLang?: string | null;
  languageLevel?: LearningLevel | null;
  topics: string[];
  partnerType: 'new_friends' | 'someone_special' | 'professional' | 'figuring_out';
  gender: 'male' | 'female' | 'beyond_binary' | 'everyone';
  ageRange: 'teens' | 'early20s' | 'late20s' | 'thirties' | 'forties';
}

export type PartnerGenerationStatus =
  | 'queued'
  | 'generating_persona'
  | 'selecting_voice'
  | 'saving_partner'
  | 'generating_avatar'
  | 'completed'
  | 'failed';

export type PartnerGenerationStep = 'persona' | 'voice' | 'partner' | 'avatar';

export interface PartnerPersonaPreview {
  name?: string | null;
  summary?: string | null;
  summaryTranslation?: string | null;
  personaAge?: string | null;
  personaGender?: string | null;
  personaOccupation?: string | null;
  personaOccupationTranslation?: string | null;
  personaCity?: string | null;
  personaCityTranslation?: string | null;
  personaCountry?: string | null;
  personaCountryTranslation?: string | null;
  personaBackground?: string | null;
  personaInterests?: string[] | null;
  personaBackgroundTranslation?: string | null;
  personaInterestsTranslation?: string[] | null;
}

export interface PartnerGenerationJob {
  id: string;
  status: PartnerGenerationStatus;
  message?: string | null;
  stepsCompleted: PartnerGenerationStep[];
  personaPreview?: PartnerPersonaPreview | null;
  partner?: ConversationPartner | null;
  error?: string | null;
}

interface PartnerPersonaPreviewApi {
  name?: string | null;
  summary?: string | null;
  summary_translation?: string | null;
  persona_age?: string | null;
  persona_gender?: string | null;
  persona_occupation?: string | null;
  persona_occupation_translation?: string | null;
  persona_city?: string | null;
  persona_city_translation?: string | null;
  persona_country?: string | null;
  persona_country_translation?: string | null;
  persona_background?: string | null;
  persona_interests?: string[] | null;
  persona_background_translation?: string | null;
  persona_interests_translation?: string[] | null;
}

interface PartnerGenerationJobApi {
  job_id: string;
  status: PartnerGenerationStatus;
  message?: string | null;
  steps_completed?: PartnerGenerationStep[];
  persona_preview?: PartnerPersonaPreviewApi | null;
  partner?: PartnerApi | null;
  error?: string | null;
}

export async function fetchPartners(token: string): Promise<ConversationPartner[]> {
  const data = await authedFetch<PartnerListApi>(`/partners`, token);
  return data.partners.map(mapPartner);
}

export async function createPartner(token: string, payload: PartnerCreateInput): Promise<ConversationPartner> {
  const body = {
    name: payload.name,
    description: payload.description,
    description_translation: payload.descriptionTranslation,
    learning_lang: payload.learningLang,
    native_lang: payload.nativeLang,
    avatar_url: payload.avatarUrl,
    persona_age: payload.personaAge,
    persona_gender: payload.personaGender,
    persona_occupation: payload.personaOccupation,
    persona_occupation_translation: payload.personaOccupationTranslation,
    persona_city: payload.personaCity,
    persona_city_translation: payload.personaCityTranslation,
    persona_country: payload.personaCountry,
    persona_country_translation: payload.personaCountryTranslation,
    persona_relationship: payload.personaRelationship,
    persona_background: payload.personaBackground,
    persona_background_translation: payload.personaBackgroundTranslation,
    persona_interests: payload.personaInterests,
    persona_interests_translation: payload.personaInterestsTranslation,
  };
  const data = await authedFetch<PartnerApi>('/partners', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return mapPartner(data);
}

export async function startPartnerGeneration(
  token: string,
  payload: PartnerPersonaCreateInput
): Promise<PartnerGenerationJob> {
  const body = {
    learning_lang: payload.learningLang,
    native_lang: payload.nativeLang,
    language_level: payload.languageLevel,
    topics: payload.topics,
    partner_type: payload.partnerType,
    gender: payload.gender,
    age_range: payload.ageRange,
  };
  const data = await authedFetch<PartnerGenerationJobApi>('/partners/generate', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return mapPartnerGenerationJob(data);
}

export async function fetchPartnerGenerationJob(token: string, jobId: string): Promise<PartnerGenerationJob> {
  const data = await authedFetch<PartnerGenerationJobApi>(`/partners/generate/${jobId}`, token);
  return mapPartnerGenerationJob(data);
}

export interface PartnerUpdateInput {
  name?: string;
  description?: string | null;
  learningLang?: string | null;
  nativeLang?: string | null;
  avatarUrl?: string | null;
  personaAge?: string | null;
  personaGender?: string | null;
  personaOccupation?: string | null;
  personaOccupationTranslation?: string | null;
  personaCity?: string | null;
  personaCityTranslation?: string | null;
  personaCountry?: string | null;
  personaCountryTranslation?: string | null;
  personaRelationship?: string | null;
  personaBackground?: string | null;
  personaInterests?: string | null;
}

export async function updatePartner(
  token: string,
  partnerId: string,
  payload: PartnerUpdateInput
): Promise<ConversationPartner> {
  const body: Record<string, unknown> = {};
  if (payload.name !== undefined) body.name = payload.name;
  if (payload.description !== undefined) body.description = payload.description;
  if (payload.learningLang !== undefined) body.learning_lang = payload.learningLang;
  if (payload.nativeLang !== undefined) body.native_lang = payload.nativeLang;
  if (payload.avatarUrl !== undefined) body.avatar_url = payload.avatarUrl;
  if (payload.personaAge !== undefined) body.persona_age = payload.personaAge;
  if (payload.personaGender !== undefined) body.persona_gender = payload.personaGender;
  if (payload.personaOccupation !== undefined) body.persona_occupation = payload.personaOccupation;
  if (payload.personaOccupationTranslation !== undefined)
    body.persona_occupation_translation = payload.personaOccupationTranslation;
  if (payload.personaCity !== undefined) body.persona_city = payload.personaCity;
  if (payload.personaCityTranslation !== undefined) body.persona_city_translation = payload.personaCityTranslation;
  if (payload.personaCountry !== undefined) body.persona_country = payload.personaCountry;
  if (payload.personaCountryTranslation !== undefined)
    body.persona_country_translation = payload.personaCountryTranslation;
  if (payload.personaRelationship !== undefined) body.persona_relationship = payload.personaRelationship;
  if (payload.personaBackground !== undefined) body.persona_background = payload.personaBackground;
  if (payload.personaInterests !== undefined) body.persona_interests = payload.personaInterests;

  const data = await authedFetch<PartnerApi>(`/partners/${partnerId}`, token, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return mapPartner(data);
}

export async function deletePartner(token: string, partnerId: string): Promise<void> {
  await authedFetch<void>(`/partners/${partnerId}`, token, {
    method: 'DELETE',
  });
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

export async function uploadPartnerAvatar(token: string, partnerId: string, file: File): Promise<ConversationPartner> {
  const formData = new FormData();
  formData.append('file', file);
  const data = await authedFetch<PartnerApi>(`/partners/${partnerId}/avatar`, token, {
    method: 'POST',
    body: formData,
  });
  return mapPartner(data);
}

export async function reassignConversationPartner(
  token: string,
  conversationId: string,
  partnerId: string
): Promise<ConversationSummary> {
  const data = await authedFetch<ConversationSummaryApi>(`/conversations/${conversationId}/partner`, token, {
    method: 'PATCH',
    body: JSON.stringify({ partner_id: partnerId }),
  });
  return mapSummary(data);
}

export async function fetchConversationMemories(
  token: string,
  conversationId: string
): Promise<ConversationMemoriesResponse> {
  const url = `/conversations/${conversationId}/memories`;
  const data = await authedFetch<ConversationMemoriesResponseApi>(url, token);
  return {
    memories: data.memories.map(mapMemory),
    processing: data.processing,
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
    languageLevel: LearningLevel;
  }
): Promise<OnboardingStatus> {
  const data = await authedFetch<CompleteOnboardingResponseApi>('/accounts/me/onboarding/complete', token, {
    method: 'POST',
    body: JSON.stringify({
      learning_lang: settings.learningLang,
      native_lang: settings.nativeLang,
      language_level: settings.languageLevel,
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
  language_level: string | null;
}

export async function updateLanguageSettings(
  token: string,
  settings: {
    learningLang?: string;
    nativeLang?: string;
    languageLevel?: LearningLevel;
  }
): Promise<{ learningLang?: string | null; nativeLang?: string | null; languageLevel?: LearningLevel | null }> {
  const body: Record<string, string> = {};
  if (settings.learningLang !== undefined) body.learning_lang = settings.learningLang;
  if (settings.nativeLang !== undefined) body.native_lang = settings.nativeLang;
  if (settings.languageLevel !== undefined) body.language_level = settings.languageLevel;

  const data = await authedFetch<UpdateLanguageSettingsResponseApi>('/accounts/me/languages', token, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return {
    learningLang: data.learning_lang,
    nativeLang: data.native_lang,
    languageLevel: isLearningLevel(data.language_level) ? data.language_level : null,
  };
}

// ===== Memory API =====

export async function fetchMemories(
  token: string,
  options?: {
    limit?: number;
    offset?: number;
    search?: string;
  }
): Promise<MemoryListResponse> {
  const params = new URLSearchParams();
  params.set('limit', String(options?.limit || 50));
  params.set('offset', String(options?.offset || 0));
  if (options?.search) {
    params.set('search', options.search);
  }

  const data = await authedFetch<MemoryListResponseApi>(`/memories?${params.toString()}`, token);
  return {
    items: data.items.map(mapMemory),
    total: data.total,
    limit: data.limit,
    offset: data.offset,
  };
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

export interface BulkDeleteMemoriesResponse {
  deleted: number;
  failed?: string[];
}

export async function bulkDeleteMemories(token: string, memoryIds: string[]): Promise<BulkDeleteMemoriesResponse> {
  return await authedFetch<BulkDeleteMemoriesResponse>('/memories/bulk-delete', token, {
    method: 'POST',
    body: JSON.stringify({ memory_ids: memoryIds }),
  });
}
