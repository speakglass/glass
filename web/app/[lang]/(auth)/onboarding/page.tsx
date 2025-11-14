import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import OnboardingClient from '@/components/onboarding/onboarding-client';

export default async function OnboardingPage({ params }: { params: Promise<{ lang: string }> }) {
  const session = await auth();
  const { lang } = await params;

  // Redirect to login if not authenticated
  if (!session?.user) {
    redirect(`/${lang}/login`);
  }

  return <OnboardingClient />;
}
