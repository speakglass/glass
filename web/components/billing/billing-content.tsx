'use client';

import { useEffect, useState, type ComponentProps } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAccountSession } from '@/contexts/account-session-context';
import {
  createCheckoutSession,
  createBillingPortalSession,
  createContactRequest,
  BillingPlanKey,
} from '@/lib/account-api';
import { Loader2 } from 'lucide-react';
import { Trans } from '@lingui/react/macro';
import { t } from '@lingui/core/macro';
import { toast } from 'sonner';
import { useLocale } from '@/hooks/use-locale';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.speakglass.com';

function CheckIcon() {
  return (
    <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 dark:bg-blue-500/10">
      <svg className="w-3 h-3 text-primary dark:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
    </div>
  );
}

type ButtonVariant = ComponentProps<typeof Button>['variant'];

interface PricingFeature {
  text: string;
  underlined?: boolean;
}

type BillingTier = 'free' | 'pro' | 'enterprise';

interface PricingPlan {
  planKey: BillingTier;
  name: string;
  price: string;
  period?: string;
  billingInfo: string;
  showBillingToggle?: boolean;
  features: PricingFeature[];
  cta?: string;
  ctaHref?: string;
  requiresCheckout?: boolean;
  requiresContact?: boolean;
  ctaVariant?: ButtonVariant;
  popular?: boolean;
}

const normalizePlanKey = (plan?: string | null): BillingTier => {
  const normalized = (plan ?? 'free').toLowerCase();
  if (normalized === 'monthly' || normalized === 'yearly') return 'pro';
  if (normalized === 'pro') return 'pro';
  if (normalized === 'team' || normalized === 'enterprise') return 'enterprise';
  return 'free';
};

const PLAN_RANK: Record<BillingTier, number> = {
  free: 0,
  pro: 1,
  enterprise: 2,
};

const getPricingPlans = (locale: string, isYearly: boolean): PricingPlan[] => [
  {
    planKey: 'free',
    name: t`Free`,
    price: '$0',
    billingInfo: t`Free for everyone`,
    features: [
      { text: t`AI Roleplay` },
      { text: t`Real-time suggestions` },
      { text: t`Real-time feedback` },
      { text: t`Call summary (fluency/accuracy)` },
      { text: t`Save up to 5 call summaries` },
    ],
  },
  {
    planKey: 'pro',
    name: t`Pro`,
    price: isYearly ? '$16.66' : '$24.99',
    period: t`per month`,
    billingInfo: isYearly ? t`Billed yearly` : t`Billed monthly`,
    showBillingToggle: true,
    features: [
      { text: t`All free features` },
      { text: t`Personalized Memory` },
      { text: t`Advanced Real-time suggestions based on your Memory` },
      { text: t`Save unlimited call summaries` },
    ],
    cta: isYearly ? t`Upgrade yearly` : t`Upgrade monthly`,
    requiresCheckout: true,
    popular: true,
  },
  {
    planKey: 'enterprise',
    name: t`Enterprise`,
    price: t`Contact us`,
    billingInfo: t`Annual billing only`,
    features: [{ text: t`Everything in Pro` }, { text: t`Team onboarding` }, { text: t`Priority support` }],
    cta: t`Contact sales`,
    requiresContact: true,
    ctaVariant: 'secondary',
  },
];

const getPlanDisplayName = (plan?: string | null) => {
  if (!plan) return t`Free`;
  const normalized = plan.toLowerCase();
  switch (normalized) {
    case 'free':
      return t`Free`;
    case 'monthly':
    case 'yearly':
    case 'pro':
      return t`Pro`;
    case 'team':
    case 'enterprise':
      return t`Enterprise`;
    default:
      return plan;
  }
};

const getPlanStatusLabel = (status?: string | null, active?: boolean) => {
  if (!status) {
    return active ? t`Active` : t`Inactive`;
  }
  const normalized = status.toLowerCase();
  switch (normalized) {
    case 'trialing':
      return t`Trial`;
    case 'past_due':
      return t`Past due`;
    case 'canceled':
    case 'cancelled':
      return t`Canceled`;
    case 'active':
      return null;
    default:
      return active ? t`Active` : t`Inactive`;
  }
};

const getPlanIntervalLabel = (interval?: string | null) => {
  if (!interval) return null;
  const normalized = interval.toLowerCase();
  switch (normalized) {
    case 'month':
      return t`Monthly`;
    case 'year':
      return t`Yearly`;
    default:
      return interval;
  }
};

const formatPlanRenewalDate = (periodEnd?: string | null) => {
  if (!periodEnd) return null;
  const date = new Date(periodEnd);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
};

function PricingCard({
  plan,
  index,
  total,
  isYearly,
  setIsYearly,
  loadingPlan,
  onCheckout,
  onContact,
  planLocked,
}: {
  plan: PricingPlan;
  index: number;
  total: number;
  isYearly: boolean;
  setIsYearly: (value: boolean) => void;
  loadingPlan: BillingPlanKey | null;
  onCheckout: (plan: BillingPlanKey) => Promise<void>;
  onContact?: () => void;
  planLocked: boolean;
}) {
  const currentBillingPlan: BillingPlanKey = isYearly ? 'yearly' : 'monthly';

  if (plan.popular) {
    return (
      <div className="relative rounded-2xl lg:rounded-xl border border-black/5 dark:border-white/10 bg-white dark:bg-[#1a1a1a] lg:scale-[1.02] shadow-xl z-10 px-6 py-7 flex flex-col h-full transition-all">
        <CardContent
          plan={plan}
          isYearly={isYearly}
          setIsYearly={setIsYearly}
          loadingPlan={loadingPlan}
          currentBillingPlan={currentBillingPlan}
          onCheckout={onCheckout}
          onContact={onContact}
          planLocked={planLocked}
        />
      </div>
    );
  }

  const isFirst = index === 0;
  const isLast = index === total - 1;
  const roundedClass = isFirst
    ? 'rounded-2xl lg:rounded-l-3xl lg:rounded-r-none'
    : isLast
    ? 'rounded-2xl lg:rounded-r-3xl lg:rounded-l-none'
    : 'rounded-2xl lg:rounded-none';
  const borderClass = isFirst ? 'border' : 'border lg:border-t lg:border-r lg:border-b lg:border-l-0';

  return (
    <div
      className={`relative ${roundedClass} ${borderClass} border-black/5 dark:border-white/6 bg-white dark:bg-[#151515] p-6 flex flex-col h-full transition-all`}
    >
      <CardContent
        plan={plan}
        isYearly={isYearly}
        setIsYearly={setIsYearly}
        loadingPlan={loadingPlan}
        currentBillingPlan={currentBillingPlan}
        onCheckout={onCheckout}
        onContact={onContact}
        planLocked={planLocked}
      />
    </div>
  );
}

function CardContent({
  plan,
  isYearly,
  setIsYearly,
  loadingPlan,
  currentBillingPlan,
  onCheckout,
  onContact,
  planLocked,
}: {
  plan: PricingPlan;
  isYearly: boolean;
  setIsYearly: (value: boolean) => void;
  loadingPlan: BillingPlanKey | null;
  currentBillingPlan: BillingPlanKey;
  onCheckout: (plan: BillingPlanKey) => Promise<void>;
  onContact?: () => void;
  planLocked: boolean;
}) {
  return (
    <>
      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-4 text-emphasis">{plan.name}</h3>
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-semibold text-emphasis">{plan.price}</span>
          {plan.period && <span className="text-subtle text-base ml-1">{plan.period}</span>}
        </div>
      </div>

      <div className="flex items-center gap-2 min-h-[68px] py-5 px-6 -mx-6 mb-6 border-t border-b border-black/5 dark:border-white/6">
        {plan.showBillingToggle && (
          <Switch checked={isYearly} onCheckedChange={setIsYearly} aria-label="Toggle billing period" />
        )}
        <div className="text-subtle text-sm">{plan.billingInfo}</div>
      </div>

      <div className="flex-1 mb-8">
        <ul className="space-y-4">
          {plan.features.map((feature, index) => (
            <li key={index} className="flex items-start gap-3">
              <span className="text-primary mt-0.5 shrink-0">
                <CheckIcon />
              </span>
              <span className="text-emphasis text-[13px]">
                {feature.underlined ? (
                  <span className="underline decoration-1 underline-offset-2 decoration-white/30">{feature.text}</span>
                ) : (
                  feature.text
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {plan.requiresContact && plan.cta && onContact ? (
        <Button variant={plan.ctaVariant || 'secondary'} size="lg" className="w-full" onClick={onContact}>
          {plan.cta}
        </Button>
      ) : plan.requiresCheckout && plan.cta ? (
        <Button
          variant={plan.ctaVariant || 'default'}
          size="lg"
          className="w-full"
          onClick={() => void onCheckout(currentBillingPlan)}
          disabled={planLocked || loadingPlan !== null}
        >
          {loadingPlan === currentBillingPlan && !planLocked && <Loader2 className="h-4 w-4 animate-spin" />}
          {planLocked ? <Trans>Current plan</Trans> : plan.cta}
        </Button>
      ) : plan.cta && plan.ctaHref ? (
        planLocked ? (
          <Button variant={plan.ctaVariant || 'secondary'} size="lg" className="w-full" disabled>
            <Trans>Current plan</Trans>
          </Button>
        ) : (
          <Button variant={plan.ctaVariant || 'secondary'} size="lg" className="w-full" asChild>
            <Link href={plan.ctaHref} prefetch={false} target="_blank" rel="noreferrer">
              {plan.cta}
            </Link>
          </Button>
        )
      ) : null}
    </>
  );
}

export function BillingContent() {
  const { snapshot, token, status } = useAccountSession();
  const [loadingPlan, setLoadingPlan] = useState<BillingPlanKey | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);
  const [contactForm, setContactForm] = useState({
    company: '',
    companySize: '',
    message: '',
  });
  const billingDisabled = snapshot?.billing?.selfHosted || !snapshot?.billing?.enabled;
  const planDisplayName = getPlanDisplayName(snapshot?.billing?.plan);
  const planStatusLabel = getPlanStatusLabel(snapshot?.billing?.status, snapshot?.billing?.active);
  const planRenewalLabel = formatPlanRenewalDate(snapshot?.billing?.currentPeriodEnd);
  const locale = useLocale();
  const [isYearly, setIsYearly] = useState(true);
  const pricingPlans = getPricingPlans(locale, isYearly);
  const currentPlanKey = normalizePlanKey(snapshot?.billing?.plan);
  const isFreePlan = currentPlanKey === 'free';
  const planIntervalLabel = getPlanIntervalLabel(snapshot?.billing?.planInterval);
  const planStatusRaw = snapshot?.billing?.status?.toLowerCase();
  const scheduledCancelAt = formatPlanRenewalDate(snapshot?.billing?.cancelAt || null);
  const isCancelled =
    planStatusRaw === 'canceled' ||
    planStatusRaw === 'cancelled' ||
    Boolean(snapshot?.billing?.cancelAtPeriodEnd) ||
    Boolean(snapshot?.billing?.cancelAt);
  const checkoutPlan: BillingPlanKey = isYearly ? 'yearly' : 'monthly';
  const checkoutLabel = isYearly ? t`Upgrade yearly` : t`Upgrade monthly`;

  const handleCheckout = async (plan: BillingPlanKey) => {
    if (!token) {
      toast.error(t`Please sign in again`);
      return;
    }
    setLoadingPlan(plan);
    try {
      const session = await createCheckoutSession(token, { plan });
      if (typeof window !== 'undefined') {
        window.open(session.checkoutUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      console.error('[Billing] Failed to start checkout', error);
      toast.error(t`Unable to open checkout`);
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleManageSubscription = async () => {
    if (!token) {
      toast.error(t`Please sign in again`);
      return;
    }
    if (!snapshot?.billing?.plan) {
      toast.error(t`No active subscription to manage`);
      return;
    }
    setPortalLoading(true);
    try {
      const session = await createBillingPortalSession(token, {
        returnUrl: `${APP_URL}/${locale}/billing`,
      });
      if (typeof window !== 'undefined') {
        window.open(session.portalUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      console.error('[Billing] Failed to open portal', error);
      toast.error(t`Unable to open billing portal`);
    } finally {
      setPortalLoading(false);
    }
  };

  const handleContactSubmit = async () => {
    if (!token) {
      toast.error(t`Please sign in again`);
      return;
    }
    if (!contactForm.message.trim()) {
      toast.error(t`Please complete the required fields`);
      return;
    }
    setContactLoading(true);
    try {
      const name = snapshot?.user?.name?.trim() || 'Unknown';
      const email = snapshot?.user?.email?.trim();
      if (!email) {
        toast.error(t`Missing email in profile`);
        setContactLoading(false);
        return;
      }
      await createContactRequest(token, {
        name,
        email,
        company: contactForm.company.trim() || undefined,
        companySize: contactForm.companySize || undefined,
        message: contactForm.message.trim(),
      });
      toast.success(t`We'll be in touch shortly`);
      setContactDialogOpen(false);
      setContactForm({ company: '', companySize: '', message: '' });
    } catch (error) {
      console.error('[Billing] Failed to send contact request', error);
      toast.error(t`Unable to submit request`);
    } finally {
      setContactLoading(false);
    }
  };

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <Trans>Loading billing…</Trans>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="rounded-3xl border border-border/60 bg-card/60 px-6 py-12 text-center text-sm text-muted-foreground">
        <Trans>We couldn't load your account details. Please refresh and try again.</Trans>
      </div>
    );
  }

  if (billingDisabled) {
    return (
      <div className="rounded-3xl border border-border/60 bg-card/60 px-6 py-12 text-center space-y-3">
        <h3 className="text-lg font-semibold">
          <Trans>Billing is not available</Trans>
        </h3>
        <p className="text-sm text-muted-foreground">
          <Trans>This Glass instance is running in self-hosted mode, so upgrades aren't required.</Trans>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <section className="rounded-3xl border border-border/70 bg-card/70 px-6 py-6 md:px-8 md:py-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Trans>Current plan</Trans>
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground">{planDisplayName}</h2>
              {planIntervalLabel && (
                <span className="rounded-full border border-border/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {planIntervalLabel}
                </span>
              )}
              {!isFreePlan && planStatusLabel && (
                <span className="rounded-full border border-border/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {planStatusLabel}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {scheduledCancelAt ? (
                <Trans>Plan ends on {scheduledCancelAt}</Trans>
              ) : planRenewalLabel ? (
                isCancelled ? (
                  <Trans>Plan ends on {planRenewalLabel}</Trans>
                ) : (
                  <Trans>Renews on {planRenewalLabel}</Trans>
                )
              ) : isFreePlan ? (
                <Trans>The Free plan never expires. Upgrade anytime for unlimited history.</Trans>
              ) : (
                <Trans>Billing active.</Trans>
              )}
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 md:w-auto">
            {isFreePlan ? (
              <Button
                size="lg"
                className="cursor-pointer w-full md:w-auto"
                onClick={() => void handleCheckout(checkoutPlan)}
                disabled={loadingPlan !== null}
              >
                {loadingPlan === checkoutPlan && <Loader2 className="h-4 w-4 animate-spin" />}
                {checkoutLabel}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="lg"
                className="cursor-pointer w-full md:w-auto"
                onClick={() => void handleManageSubscription()}
                disabled={portalLoading}
              >
                {portalLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                <Trans>Manage subscription</Trans>
              </Button>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-border/60 bg-card/60 px-4 py-8 md:px-8 md:py-12">
        <div className="flex flex-col items-center justify-center text-center mb-12">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Trans>Pricing</Trans>
          </p>
          <h3 className="text-4xl font-semibold text-emphasis mt-4 mb-4">
            <Trans>Scale with the right plan</Trans>
          </h3>
          <p className="text-subtle text-base">
            <Trans>Choose monthly or yearly billing and unlock Glass features tailored to your team.</Trans>
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-0 mb-8">
          {pricingPlans.map((plan, index) => (
            <PricingCard
              key={plan.name}
              plan={plan}
              index={index}
              total={pricingPlans.length}
              isYearly={isYearly}
              setIsYearly={setIsYearly}
              loadingPlan={loadingPlan}
              onCheckout={handleCheckout}
              onContact={plan.requiresContact ? () => setContactDialogOpen(true) : undefined}
              planLocked={PLAN_RANK[currentPlanKey] >= PLAN_RANK[plan.planKey]}
            />
          ))}
        </div>
      </section>

      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Trans>Contact sales</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>Tell us a little about your team and we’ll reach out shortly.</Trans>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>
                  <Trans>Company</Trans>
                </Label>
                <Input
                  value={contactForm.company}
                  onChange={(event) => setContactForm((prev) => ({ ...prev, company: event.target.value }))}
                  placeholder={t`Company name`}
                />
              </div>
              <div className="space-y-1">
                <Label>
                  <Trans>Company size</Trans>
                </Label>
                <Select
                  value={contactForm.companySize}
                  onValueChange={(value) => setContactForm((prev) => ({ ...prev, companySize: value }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t`Select size`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-10">1-10</SelectItem>
                    <SelectItem value="11-25">11-25</SelectItem>
                    <SelectItem value="26-50">26-50</SelectItem>
                    <SelectItem value="51-100">51-100</SelectItem>
                    <SelectItem value="100+">100+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>
                <Trans>Tell us about your requirements</Trans>
              </Label>
              <Textarea
                value={contactForm.message}
                onChange={(event) => setContactForm((prev) => ({ ...prev, message: event.target.value }))}
                rows={4}
                placeholder={t`I'm interested in Glass for my team...`}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setContactDialogOpen(false)} disabled={contactLoading}>
              <Trans>Cancel</Trans>
            </Button>
            <Button onClick={handleContactSubmit} disabled={contactLoading}>
              {contactLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              <Trans>Send request</Trans>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
