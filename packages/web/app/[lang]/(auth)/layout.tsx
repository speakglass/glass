export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // Auth pages don't have Nav
  return <>{children}</>;
}
