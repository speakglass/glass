'use client';

import { useState } from 'react';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/utils/index';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Trans } from '@lingui/react/macro';

export function ForgotPasswordForm({ className, ...props }: React.ComponentProps<'div'>) {
  const lang = useLocale();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email) {
      toast.error('Email is required');
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error('Failed to send reset email');
      }

      setIsSubmitted(true);
      // Toast messages can remain in English or be handled separately
      toast.success('Check your email for the reset link');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send reset email');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className={cn('flex flex-col gap-6', className)} {...props}>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">
              <Trans>Check your email</Trans>
            </CardTitle>
            <CardDescription>
              <Trans>
                If an account exists for <span className="font-medium">{email}</span>, you will receive a password reset
                link shortly.
              </Trans>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <Button asChild className="w-full">
                  <a href={`/${lang}/login`}>
                    <Trans>Return to login</Trans>
                  </a>
                </Button>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            <Trans>Forgot your password?</Trans>
          </CardTitle>
          <CardDescription>
            <Trans>Enter your email address and we&apos;ll send you a reset link</Trans>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">
                  <Trans>Email</Trans>
                </FieldLabel>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="m@example.com"
                  required
                  autoFocus
                />
              </Field>
              <Field>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? <Trans>Sending...</Trans> : <Trans>Send reset link</Trans>}
                </Button>
                <FieldDescription className="text-center">
                  <Trans>
                    Remember your password?{' '}
                    <a href={`/${lang}/login`} className="underline hover:text-primary">
                      Sign in
                    </a>
                  </Trans>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
