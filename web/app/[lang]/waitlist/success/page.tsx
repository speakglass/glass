'use client';
import { PartyPopper } from 'lucide-react';
import { Trans } from '@lingui/react/macro';
import { initLingui } from '@/initLingui';
export default async function WaitlistSuccessPage({
  params,
}: {
  params: { lang: string };
}) {
  initLingui(params.lang);
  return (
    <main
      className={
        'relative min-h-screen flex items-center justify-center p-6 overflow-hidden'
      }
    >
      {/* Confetti */}
      <div className={'pointer-events-none absolute inset-0'} aria-hidden>
        <style>{`
          @keyframes confetti-fall {
            0% { transform: translateY(-10%) rotate(0deg); opacity: 0; }
            10% { opacity: 1; }
            100% { transform: translateY(110vh) rotate(360deg); opacity: 0; }
          }
          .confetti { position: absolute; top: -10%; width: 8px; height: 12px; border-radius: 2px; animation: confetti-fall linear forwards; }
        `}</style>
        {Array.from({ length: 24 }).map((_, i) => {
          const left = Math.random() * 100;
          const duration = 2.5 + Math.random() * 1.8;
          const delay = Math.random() * 0.6;
          const colors = [
            '#FF6B6B',
            '#F7B32B',
            '#6EE7B7',
            '#60A5FA',
            '#C084FC',
          ];
          const color = colors[i % colors.length];
          return (
            <span
              key={i}
              className={'confetti'}
              style={{
                left: `${left}%`,
                backgroundColor: color,
                animationDuration: `${duration}s`,
                animationDelay: `${delay}s`,
              }}
            />
          );
        })}
      </div>

      <div className={'relative max-w-md w-full text-center'}>
        <div
          className={
            'mx-auto mb-5 h-14 w-14 rounded-full bg-purple-500/10 flex items-center justify-center border border-purple-500/20 shadow-md'
          }
        >
          <PartyPopper className={'h-7 w-7 text-purple-500'} />
        </div>
        <h1 className={'text-3xl font-semibold mb-2'}>
          <Trans>You’re on the list 🎉</Trans>
        </h1>
        <p className={'text-sm text-muted-foreground mb-8'}>
          <Trans>
            Thanks for joining. We’ll email you when more access is available.
            Sit tight — it won’t be long.
          </Trans>
        </p>
        <a
          href="/"
          className={
            'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90'
          }
        >
          <Trans>Back to Home</Trans>
        </a>
      </div>
    </main>
  );
}
