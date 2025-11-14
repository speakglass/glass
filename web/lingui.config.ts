import type { LinguiConfig } from '@lingui/conf';

const config: LinguiConfig = {
  locales: ['en', 'ja', 'ko', 'zh', 'es', 'fr'],
  pseudoLocale: 'pseudo',
  sourceLocale: 'en',
  fallbackLocales: {
    default: 'en',
  },
  catalogs: [
    {
      path: 'locales/{locale}',
      include: ['app/', 'components/', 'contexts/', 'hooks/', 'lib/'],
    },
  ],
};

export default config;
