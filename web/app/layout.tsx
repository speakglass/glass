import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { Nav } from '@/components/Nav';
import { cn } from '@/utils';
import { Toaster } from '@/components/ui/sonner';
import { AppProviders } from '@/components/AppProviders';

export const metadata: Metadata = {
  title: 'Glass',
  description: 'Glass - Empathic Voice Interface',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(GeistSans.variable, GeistMono.variable, 'flex flex-col min-h-screen')}>
        <AppProviders>
          <Nav />
          {children}
          <Toaster position="top-center" richColors={true} />
        </AppProviders>
      </body>
    </html>
  );
}
