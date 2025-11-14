'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from '@/hooks/use-locale';
import { signOut } from 'next-auth/react';
import { Trans } from '@lingui/react/macro';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const apiBase = process.env.NEXT_PUBLIC_GLASS_API_URL || 'http://localhost:8000';

export default function VerifyEmailPage() {
  const router = useRouter();
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
          const error = await response.json().catch(() => ({ detail: 'Verification failed' }));
          setErrorMessage(error.detail || 'Verification failed');
          setStatus('error');
        }
      })
      .catch((error) => {
        console.error('Verification error:', error);
        setErrorMessage('Network error occurred');
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
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        <div className="text-center space-y-6">
          {status === 'verifying' && (
            <>
              <Loader2 className="w-16 h-16 text-primary animate-spin mx-auto" />
              <h1 className="text-2xl font-semibold">
                <Trans>Verifying your email...</Trans>
              </h1>
              <p className="text-muted-foreground">
                <Trans>Please wait while we verify your email address</Trans>
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
              <h1 className="text-2xl font-semibold">
                <Trans>Email verified!</Trans>
              </h1>
              <p className="text-muted-foreground">
                <Trans>Your email ({email}) has been successfully verified.</Trans>
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                <Trans>Redirecting to login in {countdown} seconds...</Trans>
              </p>
              <Button onClick={handleGoToLogin} className="mt-4">
                <Trans>Go to Login Now</Trans>
              </Button>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle className="w-16 h-16 text-red-500 mx-auto" />
              <h1 className="text-2xl font-semibold">
                <Trans>Verification failed</Trans>
              </h1>
              <p className="text-muted-foreground">
                {errorMessage || <Trans>The verification link is invalid or has expired.</Trans>}
              </p>
              <Button onClick={handleGoToLogin} variant="outline" className="mt-4">
                <Trans>Go to Login</Trans>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
