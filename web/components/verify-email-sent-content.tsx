'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale } from '@/hooks/use-locale';
import { signOut } from 'next-auth/react';
import { Trans } from '@lingui/react/macro';
import { Mail, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup } from '@/components/ui/field';
import { toast } from '@/utils/toast';
import { cn } from '@/utils/index';

const apiBase = process.env.NEXT_PUBLIC_GLASS_API_URL || 'http://localhost:8000';

export function VerifyEmailSentContent({ className, ...props }: React.ComponentProps<'div'>) {
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
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Mail className="w-16 h-16 text-primary" />
          </div>
          <CardTitle className="text-xl">
            <Trans>Check your email</Trans>
          </CardTitle>
          <CardDescription className="space-y-1">
            <span className="block">
              <Trans>We've sent a verification link to</Trans>
            </span>
            {email && <span className="block font-medium text-foreground">{email}</span>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="text-center text-sm text-muted-foreground space-y-2 pb-2">
              <p>
                <Trans>Click the link in the email to verify your account and continue to Glass.</Trans>
              </p>
              <p>
                <Trans>If you don't see the email, check your spam folder.</Trans>
              </p>
            </div>

            <Field>
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
            </Field>

            <Field>
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
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  );
}
