import { Trans } from '@lingui/react/macro';
import { initLingui } from '@/lib/init-lingui';
import { DEFAULT_LANGUAGE, LOCALIZED_LANGUAGE_CODES } from '@/lib/supported-languages';
import Discord from '@/components/logos/discord';
import { Nav } from '@/components/nav';
import { Clock } from 'lucide-react';

export default async function TimeLimitPage({ params }: { params: Promise<{ lang: string }> }) {
  const rawLang = (await params).lang;
  const lang = (LOCALIZED_LANGUAGE_CODES as readonly string[]).includes(rawLang as any) ? rawLang : DEFAULT_LANGUAGE;
  initLingui(lang);
  return (
    <>
      <Nav />
      <main className={'min-h-screen flex items-center justify-center p-6 bg-background pt-20'}>
        <div className={'max-w-sm w-full'}>
          {/* Main Content */}
          <div className={'text-center mb-8'}>
            <div className={'mx-auto mb-4 w-12 h-12 rounded-full bg-muted flex items-center justify-center'}>
              <Clock className={'w-6 h-6 text-muted-foreground'} />
            </div>
            <h1 className={'text-3xl font-semibold mb-3 tracking-tight'}>
              <Trans>Your free time is up</Trans>
            </h1>
            <p className={'text-muted-foreground'}>
              <Trans>Want to keep practicing?</Trans>
            </p>
          </div>

          {/* Discord Button */}
          <a
            href="https://discord.gg/VNkMmt8w"
            target="_blank"
            rel="noopener noreferrer"
            className={
              'flex items-center justify-center gap-2 w-full rounded-lg px-4 py-2.5 text-sm font-medium bg-[#5865F2] text-white hover:bg-[#4752C4] transition-all mb-3'
            }
          >
            <Discord className={'w-4 h-4'} />
            <Trans>Join Community</Trans>
          </a>

          <p className={'text-xs text-center text-muted-foreground mb-6'}>
            <Trans>Request more time from the host in the community</Trans>
          </p>

          {/* Back Link */}
          <a
            href="/"
            className={
              'flex items-center justify-center w-full text-sm text-muted-foreground hover:text-foreground transition-colors'
            }
          >
            <Trans>← Back to Home</Trans>
          </a>
        </div>
      </main>
    </>
  );
}
