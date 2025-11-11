import {
  LOCALIZED_LANGUAGE_CODES,
  DEFAULT_LANGUAGE,
} from './lib/supported-languages';

/** @type {import('@lingui/conf').LinguiConfig} */
export default {
  locales: LOCALIZED_LANGUAGE_CODES,
  fallbackLocales: {
    default: DEFAULT_LANGUAGE,
  },
  sourceLocale: DEFAULT_LANGUAGE,
  catalogs: [
    {
      path: 'locales/{locale}',
      include: [
        'app/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
        'lib/**/*.{ts,tsx}'
      ],
      exclude: ['**/node_modules/**'],
    },
  ],
  format: 'po',
  formatOptions: {
    lineNumbers: false,
  },
  orderBy: 'messageId',
};
