'use client';

import { useState, useMemo, useEffect } from 'react';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/utils/index';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { signIn } from 'next-auth/react';
import { toast } from 'sonner';
import { Eye, EyeOff, X, Check } from 'lucide-react';
import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';

interface PasswordRequirement {
  label: string;
  met: boolean;
}

export function SignupForm({ className, ...props }: React.ComponentProps<'div'>) {
  const lang = useLocale();
  const { _ } = useLingui();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasGoogleOAuth, setHasGoogleOAuth] = useState(false);

  // Check if Google OAuth is configured
  useEffect(() => {
    fetch('/api/auth/providers')
      .then((res) => res.json())
      .then((data) => setHasGoogleOAuth(!!data.google))
      .catch(() => setHasGoogleOAuth(false));
  }, []);

  const passwordRequirements = useMemo<PasswordRequirement[]>(() => {
    return [
      {
        label: _(msg`Minimum 8 characters`),
        met: password.length >= 8,
      },
      {
        label: _(msg`At least one number`),
        met: /\d/.test(password),
      },
      {
        label: _(msg`At least one special character`),
        met: /[!@#$%^&*(),.?":{}|<>]/.test(password),
      },
    ];
  }, [password, _]);

  const isPasswordValid = passwordRequirements.every((req) => req.met);

  const handleGoogleSignUp = async () => {
    await signIn('google', { callbackUrl: `/${lang}/onboarding` });
  };

  const handleEmailSignup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email || !password) {
      toast.error('Email and password are required');
      return;
    }

    if (!isPasswordValid) {
      toast.error('Password does not meet all requirements');
      return;
    }

    setIsSubmitting(true);

    try {
      // Step 1: Create account
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 409) {
          toast.error('An account with this email already exists. Please login instead.');
        } else {
          toast.error(data?.detail || 'Failed to create account');
        }
        setIsSubmitting(false);
        return;
      }

      // Check if this was adding a password to an OAuth account
      if (data?.message === 'Password added successfully') {
        toast.success('Password added to your existing account!');
      }

      // Check if email verification is required
      if (data?.message === 'Please check your email to verify your account') {
        toast.success('Account created! Please check your email to verify your account.');
        // Redirect to a waiting/instruction page instead of onboarding
        setTimeout(() => {
          window.location.href = `/${lang}/verify-email-sent?email=${encodeURIComponent(email)}`;
        }, 1500);
        return;
      }

      // Step 2: Auto-login (only if email verification is not required)
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        toast.error('Account created but login failed. Please try logging in manually.');
        setTimeout(() => {
          window.location.href = `/${lang}/login`;
        }, 2000);
        return;
      }

      if (result?.ok) {
        toast.success('Account created successfully!');
        window.location.href = `/${lang}/onboarding`;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create account');
      setIsSubmitting(false);
    }
  };

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            <Trans>Create an account</Trans>
          </CardTitle>
          <CardDescription>
            {hasGoogleOAuth ? (
              <Trans>Sign up with your Google account or email</Trans>
            ) : (
              <Trans>Sign up with your email</Trans>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleEmailSignup}>
            <FieldGroup>
              {hasGoogleOAuth && (
                <>
                  <Field>
                    <Button variant="outline" type="button" className="w-full" onClick={handleGoogleSignUp}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="size-4">
                        <path
                          d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                          fill="currentColor"
                        />
                      </svg>
                      <Trans>Sign up with Google</Trans>
                    </Button>
                  </Field>
                  <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                    <Trans>Or continue with</Trans>
                  </FieldSeparator>
                </>
              )}
              <Field>
                <FieldLabel htmlFor="name">
                  <Trans>Full Name</Trans>
                </FieldLabel>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                />
              </Field>
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
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">
                  <Trans>Password</Trans>
                </FieldLabel>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <div
                  className={cn(
                    'overflow-hidden transition-all duration-300 ease-in-out',
                    password ? 'max-h-32 opacity-100' : 'max-h-0 opacity-0'
                  )}
                >
                  <div className="space-y-1.5 pt-2">
                    {passwordRequirements.map((requirement, index) => (
                      <div key={index} className="flex items-center gap-2 text-xs">
                        {requirement.met ? (
                          <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        ) : (
                          <X className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                        <span
                          className={cn(
                            'transition-colors duration-200',
                            requirement.met ? 'text-green-500' : 'text-muted-foreground'
                          )}
                        >
                          {requirement.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Field>
              <Field>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? <Trans>Creating account...</Trans> : <Trans>Create Account</Trans>}
                </Button>
                <FieldDescription className="text-center">
                  <Trans>
                    Already have an account?{' '}
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
      <FieldDescription className="px-6 text-center text-balance">
        <Trans>
          By clicking continue, you agree to our{' '}
          <a href="#" className="underline hover:text-primary">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="#" className="underline hover:text-primary">
            Privacy Policy
          </a>
          .
        </Trans>
      </FieldDescription>
    </div>
  );
}
