'use client';

import { AuthPageLayout } from '@/components/auth-page-layout';
import { ResetPasswordForm } from '@/components/reset-password-form';
import { useSearchParams, useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const params = useParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const lang = params.lang as string;

  useEffect(() => {
    if (!token) {
      router.push(`/${lang}/forgot-password`);
    }
  }, [token, lang, router]);

  if (!token) {
    return null;
  }

  return (
    <AuthPageLayout>
      <ResetPasswordForm token={token} />
    </AuthPageLayout>
  );
}
