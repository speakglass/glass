'use client';

import { I18nProvider } from '@lingui/react';
import { type Messages, i18n } from '@lingui/core';
import { useEffect, useState } from 'react';

type Props = {
  children: React.ReactNode;
  initialLocale: string;
  initialMessages: Messages;
};

export async function getServerSideProps({ locale }: { locale: string }) {
  return { props: { locale } };
}

export function LinguiClientProvider({
  children,
  initialLocale,
  initialMessages,
}: Props) {
  const [isI18nReady, setIsI18nReady] = useState(false);

  useEffect(() => {
    async function setupLingui() {
      setIsI18nReady(false);

      i18n.load(initialLocale, initialMessages);

      await i18n.activate(initialLocale);

      setIsI18nReady(true);
    }

    setupLingui();
  }, [initialLocale, initialMessages]);

  if (!isI18nReady) {
    return null;
  }

  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}
