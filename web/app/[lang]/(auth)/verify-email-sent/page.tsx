'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale } from '@/hooks/use-locale';
import { signOut } from 'next-auth/react';
import { Trans } from '@lingui/react/macro';
import { Mail, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const apiBase = process.env.NEXT_PUBLIC_GLASS_API_URL || 'http://localhost:8000';

export default function VerifyEmailSentPage() {
  const lang = useLocale();
  const searchParams = useSearchParams();
  const email = searchParams?.get('email') || '';
  const [isResending, setIsResending] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleResendEmail = async () => {
    if (!email) {
      toast.error('Email address is missing');
      return;
    }

    setIsResending(true);

    try {
      const response = await fetch(`${apiBase}/accounts/resend-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        toast.success('Verification email sent! Please check your inbox.');
      } else {
        const error = await response.json().catch(() => ({ detail: 'Failed to resend email' }));
        toast.error(error.detail || 'Failed to resend email');
      }
    } catch (error) {
      console.error('Resend error:', error);
      toast.error('Network error occurred');
    } finally {
      setIsResending(false);
    }
  };

  const handleGoToLogin = async () => {
    setIsLoggingOut(true);

    // Sign out first (handles session cleanup)
    await signOut({
      redirect: false, // Don't auto-redirect, we'll handle it manually
    });

    // Then redirect to login page
    window.location.href = `/${lang}/login`;
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Mail className="w-16 h-16 text-primary" />
          </div>
          <CardTitle className="text-2xl">
            <Trans>Check your email</Trans>
          </CardTitle>
          <CardDescription>
            <Trans>We've sent a verification link to</Trans>
          </CardDescription>
          {email && <p className="text-sm font-medium text-foreground mt-2">{email}</p>}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center text-sm text-muted-foreground space-y-2">
            <p>
              <Trans>Click the link in the email to verify your account and continue to Glass.</Trans>
            </p>
            <p>
              <Trans>If you don't see the email, check your spam folder.</Trans>
            </p>
          </div>

          <div className="space-y-2 pt-4">
            <Button variant="outline" className="w-full" onClick={handleResendEmail} disabled={isResending}>
              {isResending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  <Trans>Resending...</Trans>
                </>
              ) : (
                <Trans>Resend verification email</Trans>
              )}
            </Button>

            <Button variant="ghost" className="w-full" onClick={handleGoToLogin} disabled={isLoggingOut}>
              {isLoggingOut ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  <Trans>Signing out...</Trans>
                </>
              ) : (
                <Trans>Go to Login</Trans>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
