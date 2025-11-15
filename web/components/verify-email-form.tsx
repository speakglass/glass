'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale } from '@/hooks/use-locale';
import { signOut } from 'next-auth/react';
import { Trans } from '@lingui/react/macro';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/utils/index';

const apiBase = process.env.NEXT_PUBLIC_GLASS_API_URL || 'http://localhost:8000';

export function VerifyEmailForm({ className, ...props }: React.ComponentProps<'div'>) {
  const lang = useLocale();
  const searchParams = useSearchParams();
  const token = searchParams?.get('token');

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [email, setEmail] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [countdown, setCountdown] = useState(3);

  // Prevent duplicate requests
  const hasVerified = useRef(false);
  const hasSignedOut = useRef(false);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('No verification token provided');
      return;
    }

    // Prevent duplicate requests
    if (hasVerified.current) {
      return;
    }
    hasVerified.current = true;

    // Verify email
    fetch(`${apiBase}/accounts/verify-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        if (response.ok) {
          const data = await response.json();
          setEmail(data.email);
          setStatus('success');
        } else {
          const error = await response.json().catch(() => ({}));
          setErrorMessage(error.detail || '');
          setStatus('error');
        }
      })
      .catch((error) => {
        console.error('Verification error:', error);
        setErrorMessage('');
        setStatus('error');
      });
  }, [token]);

  // Auto-redirect after successful verification
  useEffect(() => {
    if (status === 'success') {
      // Sign out first (once)
      if (!hasSignedOut.current) {
        hasSignedOut.current = true;
        signOut({ redirect: false });
      }

      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            window.location.href = `/${lang}/login`;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [status, lang]);

  const handleGoToLogin = async () => {
    // Sign out if not already done
    if (!hasSignedOut.current) {
      hasSignedOut.current = true;
      await signOut({ redirect: false });
    }
    window.location.href = `/${lang}/login`;
  };

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {status === 'verifying' && <Loader2 className="w-16 h-16 text-primary animate-spin" />}
            {status === 'success' && <CheckCircle2 className="w-16 h-16 text-green-500" />}
            {status === 'error' && <XCircle className="w-16 h-16 text-red-500" />}
          </div>
          <CardTitle className="text-xl">
            {status === 'verifying' && <Trans>Verifying your email...</Trans>}
            {status === 'success' && <Trans>Email verified!</Trans>}
            {status === 'error' && <Trans>Verification failed</Trans>}
          </CardTitle>
          <CardDescription>
            {status === 'verifying' && <Trans>Please wait while we verify your email address</Trans>}
            {status === 'success' && (
              <Trans>
                Your email (<span className="font-medium">{email}</span>) has been successfully verified.
              </Trans>
            )}
            {status === 'error' && (errorMessage || <Trans>The verification link is invalid or has expired.</Trans>)}
          </CardDescription>
        </CardHeader>

        {(status === 'success' || status === 'error') && (
          <CardContent className="space-y-4">
            {status === 'success' && (
              <p className="text-sm text-center text-muted-foreground">
                <Trans>Redirecting to login in {countdown} seconds...</Trans>
              </p>
            )}
            <Button onClick={handleGoToLogin} variant={status === 'error' ? 'outline' : 'default'} className="w-full">
              {status === 'success' ? <Trans>Go to Login Now</Trans> : <Trans>Go to Login</Trans>}
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
