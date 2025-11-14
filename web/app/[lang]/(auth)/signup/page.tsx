import { AuthPageLayout } from '@/components/auth-page-layout';
import { SignupForm } from '@/components/signup-form';

export default function SignupPage() {
  return (
    <AuthPageLayout>
      <SignupForm />
    </AuthPageLayout>
  );
}

