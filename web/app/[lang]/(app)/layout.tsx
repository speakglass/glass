import { Nav } from '@/components/nav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // App pages have Nav
  return (
    <>
      <Nav />
      {children}
    </>
  );
}
