import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { Nav } from '@/components/Nav';
import { cn } from '@/utils';
import { Toaster } from '@/components/ui/sonner';
import { AppProviders } from '@/components/AppProviders';
import { LinguiClientProvider } from '@/components/providers/LinguiProviders';
import { allMessages, getI18nInstance } from '@/appRouterI18n';
import { initLingui, PageLangParam } from '@/initLingui';
import { LOCALIZED_LANGUAGE_CODES } from '@/lib/supported-languages';

export function generateStaticParams() {
  return LOCALIZED_LANGUAGE_CODES.map((lang) => ({
    lang,
  }));
}

export async function generateMetadata(props: PageLangParam) {
  const i18n = getI18nInstance((await props.params).lang);
  const lang = (await props.params).lang;
  const baseUrl = process.env.SITE_URL || 'https://app.speakglass.com/';
  const canonicalUrl = lang === 'en' ? baseUrl : `${baseUrl}/${lang}`;

  return {
    title: i18n._('Glass: AI that helps you speak any language'),
    description: i18n._(
      'Glass is an AI that helps you speak any language. It uses the latest in AI to help you learn and speak any language.'
    ),
    alternates: {
      canonical: canonicalUrl,
      languages: {
        'en-US': baseUrl,
        'ko-KR': `${baseUrl}/ko`,
        'ja-JP': `${baseUrl}/ja`,
      },
    },
    openGraph: {
      title: i18n._('Glass: AI that helps you speak any language'),
      description: i18n._(
        'Glass is an AI that helps you speak any language. It uses the latest in AI to help you learn and speak any language.'
      ),
      url: canonicalUrl,
      siteName: 'Glass',
      locale: lang,
      type: 'website',
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': 1000,
        'max-image-preview': 'large',
        'max-snippet': 1000,
      },
    },
    twitter: {
      title: i18n._('Glass: AI that helps you speak any language'),
      description: i18n._(
        'Glass is an AI that helps you speak any language. It uses the latest in AI to help you learn and speak any language.'
      ),
    },
  };
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}>) {
  const lang = (await params).lang;
  initLingui(lang);

  return (
    <html lang={lang} suppressHydrationWarning>
      <body
        className={cn(
          GeistSans.variable,
          GeistMono.variable,
          'flex flex-col min-h-screen'
        )}
      >
        <LinguiClientProvider
          initialLocale={lang}
          initialMessages={allMessages[lang]!}
        >
          <AppProviders>
            <Nav />
            {children}
            <Toaster position="top-center" richColors={true} />
          </AppProviders>
        </LinguiClientProvider>
      </body>
    </html>
  );
}
