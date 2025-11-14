import { AuthPageLayout } from '@/components/auth-page-layout';
import { VerifyEmailForm } from '@/components/verify-email-form';

export default function VerifyEmailPage() {
  return (
    <AuthPageLayout>
      <VerifyEmailForm />
    </AuthPageLayout>
  );
}
