import { t } from '@lingui/core/macro';

export const LANGUAGE_NAMES_BY_LOCALE: Record<string, Record<string, string>> = {
  en: { en: 'English', ko: 'Korean', ja: 'Japanese', es: 'Spanish', fr: 'French' },
  ko: { en: '영어', ko: '한국어', ja: '일본어', es: '스페인어', fr: '프랑스어' },
  ja: { en: '英語', ko: '韓国語', ja: '日本語', es: 'スペイン語', fr: 'フランス語' },
  es: { en: 'Inglés', ko: 'Coreano', ja: 'Japonés', es: 'Español', fr: 'Francés' },
  fr: { en: 'Anglais', ko: 'Coréen', ja: 'Japonais', es: 'Espagnol', fr: 'Français' },
};

export function getLanguageName(code: string | null | undefined, locale: string = 'en'): string {
  if (!code) return '—';
  const localeNames = LANGUAGE_NAMES_BY_LOCALE[locale] || LANGUAGE_NAMES_BY_LOCALE.en;
  return localeNames[code.toLowerCase()] || code;
}

export function formatConversationDuration(seconds?: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return t`${secs}s`;
  return t`${mins}m ${secs}s`;
}

export function getScoreLabel(score: number): { text: string; color: string } {
  if (score >= 80) return { text: t`Excellent`, color: 'text-emerald-500' };
  if (score >= 60) return { text: t`Good`, color: 'text-teal-500' };
  if (score >= 40) return { text: t`Average`, color: 'text-amber-500' };
  if (score >= 20) return { text: t`Below Average`, color: 'text-orange-500' };
  return { text: t`Low`, color: 'text-red-500' };
}

const SCORE_FLEX_RATIOS = [0.5, 1, 2, 1, 0.5];
const SCORE_SEGMENT_SIZE = 20;

export function getScoreIndicatorPosition(score: number): number {
  const totalFlex = SCORE_FLEX_RATIOS.reduce((sum, flex) => sum + flex, 0);

  let segmentIndex = 0;
  let segmentStart = 0;

  if (score <= 20) {
    segmentIndex = 0;
    segmentStart = 0;
  } else if (score <= 40) {
    segmentIndex = 1;
    segmentStart = 20;
  } else if (score <= 60) {
    segmentIndex = 2;
    segmentStart = 40;
  } else if (score <= 80) {
    segmentIndex = 3;
    segmentStart = 60;
  } else {
    segmentIndex = 4;
    segmentStart = 80;
  }

  const flexBeforeSegment = SCORE_FLEX_RATIOS.slice(0, segmentIndex).reduce((sum, flex) => sum + flex, 0);
  const segmentStartPercent = (flexBeforeSegment / totalFlex) * 100;
  const positionInSegment = (score - segmentStart) / SCORE_SEGMENT_SIZE;
  const segmentWidthPercent = (SCORE_FLEX_RATIOS[segmentIndex] / totalFlex) * 100;

  return segmentStartPercent + segmentWidthPercent * positionInSegment;
}
