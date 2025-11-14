import { AuthPageLayout } from '@/components/auth-page-layout';
import { ResetPasswordForm } from '@/components/reset-password-form';
import { redirect } from 'next/navigation';

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { lang } = await params;
  const { token } = await searchParams;

  if (!token) {
    redirect(`/${lang}/forgot-password`);
  }

  return (
    <AuthPageLayout>
      <ResetPasswordForm token={token} />
    </AuthPageLayout>
  );
}
