export const LEARNING_LEVELS = ['zero', 'beginner', 'elementary', 'intermediate', 'advanced'] as const;

export type LearningLevel = (typeof LEARNING_LEVELS)[number];

export const PRONUNCIATION_LEVELS: LearningLevel[] = ['zero', 'beginner', 'elementary'];

export function isLearningLevel(value: unknown): value is LearningLevel {
  return typeof value === 'string' && LEARNING_LEVELS.includes(value as LearningLevel);
}

export function needsPronunciationSupport(level: LearningLevel | undefined | null): boolean {
  if (!level) return false;
  return PRONUNCIATION_LEVELS.includes(level);
}
