import { Trans } from '@lingui/react/macro';
import { WifiOff } from 'lucide-react';
import { initLingui } from '@/initLingui';
import { DEFAULT_LANGUAGE, LOCALIZED_LANGUAGE_CODES } from '@/lib/supported-languages';

export default async function ConnectFailurePage({ params }: { params: Promise<{ lang: string }> }) {
  const rawLang = (await params).lang;
  const lang = (LOCALIZED_LANGUAGE_CODES as readonly string[]).includes(rawLang as any) ? rawLang : DEFAULT_LANGUAGE;
  initLingui(lang);
  return (
    <main className={'min-h-screen flex items-center justify-center p-6'}>
      <div className={'max-w-md w-full text-center'}>
        <div
          className={
            'mx-auto mb-5 h-14 w-14 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20 shadow-md'
          }
        >
          <WifiOff className={'h-7 w-7 text-red-500'} />
        </div>
        <h1 className={'text-2xl font-semibold mb-2'}>
          <Trans>Couldn’t connect</Trans>
        </h1>
        <p className={'text-sm text-muted-foreground mb-6'}>
          <Trans>We had trouble starting your session. Please check your internet and try again.</Trans>
        </p>
        <a
          href="/"
          className={
            'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90'
          }
        >
          <Trans>Try again</Trans>
        </a>
      </div>
    </main>
  );
}
