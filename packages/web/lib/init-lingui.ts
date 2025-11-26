import { setI18n } from '@lingui/react/server';
import { getI18nInstance, allMessages } from './app-router-i18n';

export type PageLangParam = {
  params: Promise<{ lang: string }>;
};

export function initLingui(lang: string) {
  const i18n = getI18nInstance(lang);
  const effectiveLocale = lang;

  // For Lingui v5, we use the global i18n instance
  if (i18n.locale !== effectiveLocale) {
    // Load messages from the cached messages
    const messages = allMessages[effectiveLocale] || {};

    // Only load if we have messages
    if (Object.keys(messages).length > 0) {
      i18n.load(effectiveLocale, messages);
      // Activate the locale
      i18n.activate(effectiveLocale);
    }
  }

  setI18n(i18n);
  return i18n;
}
