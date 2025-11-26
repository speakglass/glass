'use client';

import OnboardingClient from '@/components/onboarding/onboarding-client';
import { AuthGate } from '@/components/auth-gate';

export default function OnboardingPage() {
  return (
    <AuthGate>
      <OnboardingClient />
    </AuthGate>
  );
}
