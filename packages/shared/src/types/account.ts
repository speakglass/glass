import type { LearningLevel } from './learning-level';

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
  processing: boolean;
}

export interface ConversationListResponse {
  conversations: ConversationSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface BulkDeleteMemoriesResponse {
  deleted: number;
  failed?: string[];
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

export type BillingPlanKey = 'monthly' | 'yearly';
