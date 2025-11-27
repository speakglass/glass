'use client';

import { useState, useEffect } from 'react';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/utils/index';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { signIn } from 'next-auth/react';
import { toast } from 'sonner';
import { Eye, EyeOff } from 'lucide-react';
import { Trans } from '@lingui/react/macro';

export function LoginForm({ className, ...props }: React.ComponentProps<'div'>) {
  const lang = useLocale();
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

  const handleGoogleSignIn = async () => {
    await signIn('google', { callbackUrl: `/${lang}/dashboard` });
  };

  const handleEmailSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email || !password) {
      toast.error('Email and password are required');
      return;
    }

    setIsSubmitting(true);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      toast.error(
        result.error.includes('Google Sign-In')
          ? 'This account uses Google Sign-In. Please use Google login.'
          : 'Invalid email or password'
      );
      setIsSubmitting(false);
      return;
    }

    if (result?.ok) {
      toast.success('Login successful!');
      window.location.href = `/${lang}/dashboard`;
    }
  };

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            <Trans>Welcome back</Trans>
          </CardTitle>
          <CardDescription>
            {hasGoogleOAuth ? (
              <Trans>Login with your Google account or email</Trans>
            ) : (
              <Trans>Login with your email</Trans>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleEmailSignIn}>
            <FieldGroup>
              {hasGoogleOAuth && (
                <>
                  <Field>
                    <Button variant="outline" type="button" className="w-full" onClick={handleGoogleSignIn}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="size-4">
                        <path
                          d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                          fill="currentColor"
                        />
                      </svg>
                      <Trans>Login with Google</Trans>
                    </Button>
                  </Field>
                  <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                    <Trans>Or continue with</Trans>
                  </FieldSeparator>
                </>
              )}
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
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">
                    <Trans>Password</Trans>
                  </FieldLabel>
                  <a href={`/${lang}/forgot-password`} className="ml-auto text-sm underline-offset-4 hover:underline">
                    <Trans>Forgot your password?</Trans>
                  </a>
                </div>
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
              </Field>
              <Field>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? <Trans>Logging in...</Trans> : <Trans>Login</Trans>}
                </Button>
                <FieldDescription className="text-center">
                  <Trans>
                    Don&apos;t have an account?{' '}
                    <a href={`/${lang}/signup`} className="underline hover:text-primary">
                      Sign up
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
          <a
            href="https://www.speakglass.com/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-primary"
          >
            Terms of Service
          </a>{' '}
          and{' '}
          <a
            href="https://www.speakglass.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-primary"
          >
            Privacy Policy
          </a>
          .
        </Trans>
      </FieldDescription>
    </div>
  );
}
