import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ConversationHistory } from '@/components/history/conversation-history';
import { Trans } from '@lingui/react/macro';
import { initLingui } from '@/lib/init-lingui';
import { DEFAULT_LANGUAGE, LOCALIZED_LANGUAGE_CODES } from '@/lib/supported-languages';

export default async function HistoryPage({ params }: { params: Promise<{ lang: string }> }) {
  const session = await auth();
  const rawLang = (await params).lang;
  const lang = (LOCALIZED_LANGUAGE_CODES as readonly string[]).includes(rawLang as any) ? rawLang : DEFAULT_LANGUAGE;

  initLingui(lang);

  // Redirect to login if not authenticated
  if (!session?.user) {
    redirect(`/${lang}/login`);
  }

  return (
    <div className="fixed inset-0 pt-16 flex flex-col">
      {/* Header Section */}
      <div className="bg-background border-b border-border/30 z-10">
        <div className="mx-auto w-full max-w-7xl px-6 py-6">
          <div className="flex items-center justify-between gap-6">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                <Trans>Conversation history</Trans>
              </p>
              <h1 className="text-3xl font-bold">
                <Trans>Your saved calls</Trans>
              </h1>
            </div>
            <div className="size-12 rounded-full overflow-hidden bg-card/80 border border-border/50 shadow-sm">
              <img src="/glass-ai.png" alt="Glass AI" className="w-full h-full object-cover" />
            </div>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-7xl px-6 py-8">
          <ConversationHistory />
        </div>
      </div>
    </div>
  );
}
