import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ConversationHistory } from '@/components/history/conversation-history';
import { Trans } from '@lingui/react/macro';
import { initLingui } from '@/lib/init-lingui';
import {
  DEFAULT_LANGUAGE,
  LOCALIZED_LANGUAGE_CODES,
} from '@/lib/supported-languages';

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const session = await auth();
  const rawLang = (await params).lang;
  const lang = (LOCALIZED_LANGUAGE_CODES as readonly string[]).includes(
    rawLang as any
  )
    ? rawLang
    : DEFAULT_LANGUAGE;

  initLingui(lang);

  // Redirect to login if not authenticated
  if (!session?.user) {
    redirect(`/${lang}/login`);
  }

  return (
    <div className="min-h-screen pt-12 sm:pt-14">
      {/* Header Section */}
      <div className="bg-background border-b border-border/30 sticky top-12 sm:top-14 z-10">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-4 sm:py-6">
          <div className="flex items-center justify-between gap-4 sm:gap-6">
            <div className="space-y-1 sm:space-y-2 min-w-0">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                <Trans>Conversation history</Trans>
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold truncate">
                <Trans>Your saved calls</Trans>
              </h1>
            </div>
            <div className="size-10 sm:size-12 rounded-full overflow-hidden bg-card/80 border border-border/50 shadow-sm shrink-0">
              <img
                src="/glass-ai.png"
                alt="Glass AI"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-4 sm:py-8">
        <ConversationHistory />
      </div>
    </div>
  );
}
