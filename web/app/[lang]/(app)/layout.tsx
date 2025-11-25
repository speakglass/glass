import { AppNavShell } from '@/components/app-nav-shell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // App pages have Nav
  return (
    <>
      <AppNavShell />
      {children}
    </>
  );
}
