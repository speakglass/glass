"""Stripe billing helpers and plan metadata."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal

try:  # pragma: no cover - optional dependency guard
    import stripe  # type: ignore
except ImportError:  # pragma: no cover
    stripe = None  # type: ignore

LOGGER = logging.getLogger(__name__)


def _normalize_bool(value: Any) -> bool:
    """Return a deterministic boolean regardless of how the env passes it in."""
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)

PlanKey = Literal["monthly", "yearly"]
Interval = Literal["month", "year"]


@dataclass(frozen=True)
class BillingPlan:
    """Simple container describing a price that we pass to Stripe."""

    key: PlanKey
    label: str
    tier: str
    amount_cents: int
    currency: str
    interval: Interval

    @property
    def amount(self) -> float:
        return round(self.amount_cents / 100, 2)


class BillingDisabledError(RuntimeError):
    """Raised when billing is disabled (self-hosted instance)."""


class StripeService:
    """Wrapper around the Stripe SDK with async-friendly helpers."""

    def __init__(
        self,
        *,
        api_key: str | None,
        webhook_secret: str | None,
        monthly_amount_cents: int,
        yearly_amount_cents: int,
        currency: str,
        self_hosted: bool | str | int | None,
    ) -> None:
        self.self_hosted = _normalize_bool(self_hosted)
        self.webhook_secret = webhook_secret
        normalized_currency = (currency or "usd").lower()
        self.plans: dict[PlanKey, BillingPlan] = {
            "monthly": BillingPlan(
                key="monthly",
                label="Monthly",
                tier="pro",
                amount_cents=monthly_amount_cents,
                currency=normalized_currency,
                interval="month",
            ),
            "yearly": BillingPlan(
                key="yearly",
                label="Yearly",
                tier="pro",
                amount_cents=yearly_amount_cents,
                currency=normalized_currency,
                interval="year",
            ),
        }
        self._enabled = bool(api_key) and not self.self_hosted and stripe is not None
        self._configured = bool(api_key)
        self._api_key = api_key
        if api_key and stripe is None:
            LOGGER.warning("Stripe API key configured but the stripe package is not installed")
        if api_key and stripe is not None:
            stripe.api_key = api_key
            stripe.max_network_retries = 2
            stripe.api_version = "2025-10-29.clover"
            LOGGER.info("Stripe initialized (self_hosted=%s, billing_enabled=%s)", self.self_hosted, self._enabled)
        else:
            LOGGER.info("Stripe not configured (missing API key)")

    @property
    def enabled(self) -> bool:
        return self._enabled

    def plan_for(self, key: PlanKey) -> BillingPlan:
        plan = self.plans.get(key)
        if not plan:
            raise ValueError(f"Unsupported billing plan '{key}'")
        return plan

    def config_payload(self) -> dict:
        return {
            "enabled": self.enabled,
            "self_hosted": self.self_hosted,
            "provider": "stripe" if self._configured else "none",
            "plans": [
                {
                    "key": plan.key,
                    "label": plan.label,
                    "amount_cents": plan.amount_cents,
                    "amount": plan.amount,
                    "currency": plan.currency,
                    "interval": plan.interval,
                }
                for plan in self.plans.values()
            ],
        }

    async def create_checkout_session(
        self,
        *,
        user_id: str,
        customer_email: str,
        plan_key: PlanKey,
        success_url: str,
        cancel_url: str,
        customer_id: str | None = None,
    ) -> Any:
        if not self.enabled:
            raise BillingDisabledError("Billing is disabled")
        if stripe is None:  # pragma: no cover - guard for optional dependency
            raise BillingDisabledError("Stripe SDK not installed")

        plan = self.plan_for(plan_key)

        def _create_session() -> Any:
            kwargs: dict = {
                "mode": "subscription",
                "success_url": success_url,
                "cancel_url": cancel_url,
                "client_reference_id": user_id,
                "allow_promotion_codes": True,
                "metadata": {
                    "plan": plan.tier,
                    "plan_key": plan.key,
                    "interval": plan.interval,
                    "user_id": user_id,
                },
                "line_items": [
                    {
                        "price_data": {
                            "currency": plan.currency,
                            "product_data": {
                                "name": f"Glass {plan.label} Plan",
                            },
                            "unit_amount": plan.amount_cents,
                            "recurring": {
                                "interval": plan.interval,
                            },
                        },
                        "quantity": 1,
                    }
                ],
                "subscription_data": {
                    "metadata": {
                        "plan": plan.tier,
                        "plan_key": plan.key,
                        "interval": plan.interval,
                        "user_id": user_id,
                    }
                },
            }
            if customer_id:
                kwargs["customer"] = customer_id
            else:
                kwargs["customer_email"] = customer_email
            session = stripe.checkout.Session.create(**kwargs)
            return session

        return await asyncio.to_thread(_create_session)

    async def create_billing_portal_session(self, *, customer_id: str, return_url: str) -> Any:
        if not self.enabled:
            raise BillingDisabledError("Billing is disabled")
        if stripe is None:  # pragma: no cover - guard for optional dependency
            raise BillingDisabledError("Stripe SDK not installed")

        def _create_session() -> Any:
            return stripe.billing_portal.Session.create(
                customer=customer_id,
                return_url=return_url,
            )

        return await asyncio.to_thread(_create_session)

    def parse_event(self, payload: bytes, signature: str | None) -> Any:
        if not self.enabled:
            raise BillingDisabledError("Billing is disabled")
        if not self.webhook_secret:
            raise RuntimeError("Stripe webhook secret is not configured")
        if not signature:
            raise ValueError("Missing Stripe-Signature header")
        if stripe is None:  # pragma: no cover - guard for optional dependency
            raise BillingDisabledError("Stripe SDK not installed")
        return stripe.Webhook.construct_event(payload=payload, sig_header=signature, secret=self.webhook_secret)

    async def retrieve_subscription(self, subscription_id: str) -> Any:
        if not self.enabled:
            raise BillingDisabledError("Billing is disabled")
        if stripe is None:  # pragma: no cover - guard for optional dependency
            raise BillingDisabledError("Stripe SDK not installed")

        def _retrieve() -> Any:
            return stripe.Subscription.retrieve(subscription_id)

        return await asyncio.to_thread(_retrieve)

    def subscription_payload(self, stripe_subscription: stripe.Subscription | dict | None) -> dict[str, str | datetime | None]:
        if not stripe_subscription:
            return {}
        metadata = stripe_subscription.get("metadata", {}) if isinstance(stripe_subscription, dict) else {}
        plan = metadata.get("plan")
        interval = metadata.get("interval")
        plan_key_meta = metadata.get("plan_key")
        if isinstance(stripe_subscription, dict):
            plan_obj = stripe_subscription.get("plan") or {}
            if not interval:
                interval = (plan_obj.get("interval") or "").lower() or None
            if not plan:
                product_tier = metadata.get("tier") or metadata.get("product")
                if product_tier:
                    plan = product_tier
        if plan_key_meta in {"monthly", "yearly"} and not interval:
            interval = "year" if plan_key_meta == "yearly" else "month"
        if plan in {"monthly", "yearly"} and not interval:
            interval = "year" if plan == "yearly" else "month"
            plan = "pro"
        if not plan and plan_key_meta in {"monthly", "yearly"}:
            plan = "pro"
        current_period_end = stripe_subscription.get("current_period_end") if isinstance(stripe_subscription, dict) else None
        if not current_period_end and isinstance(stripe_subscription, dict):
            items = stripe_subscription.get("items") or {}
            data = items.get("data") if isinstance(items, dict) else None
            if isinstance(data, list) and data:
                item = data[0] or {}
                current_period_end = item.get("current_period_end")
            # Fallback to invoice period if available
            if not current_period_end:
                latest_invoice = stripe_subscription.get("latest_invoice")
                if isinstance(latest_invoice, dict):
                    current_period_end = latest_invoice.get("period_end")
        end_at = None
        if current_period_end:
            end_at = datetime.fromtimestamp(int(current_period_end), tz=timezone.utc)
        cancel_at_value = None
        if isinstance(stripe_subscription, dict):
            cancel_at_ts = stripe_subscription.get("cancel_at")
            if cancel_at_ts:
                cancel_at_value = datetime.fromtimestamp(int(cancel_at_ts), tz=timezone.utc)
        cancel_at_period_end = None
        if isinstance(stripe_subscription, dict):
            cap = stripe_subscription.get("cancel_at_period_end")
            if cap is not None:
                cancel_at_period_end = bool(cap)
        status = stripe_subscription.get("status") if isinstance(stripe_subscription, dict) else None
        subscription_id = stripe_subscription.get("id") if isinstance(stripe_subscription, dict) else None
        customer_id = stripe_subscription.get("customer") if isinstance(stripe_subscription, dict) else None
        return {
            "plan": plan,
            "plan_interval": interval,
            "status": status,
            "current_period_end": end_at,
            "subscription_id": subscription_id,
            "customer_id": customer_id,
            "cancel_at": cancel_at_value,
            "cancel_at_period_end": cancel_at_period_end,
        }

    def user_status_payload(self, user) -> dict[str, bool | str | datetime | None]:
        status = (user.subscription_status or "").lower() if user else ""
        allowed_statuses = {"active", "trialing"}
        active = (
            self.self_hosted
            or not self.enabled
            or (user.billing_exempt if user else False)
            or (status in allowed_statuses)
        )
        plan_value = (user.subscription_plan or "").lower() if user else ""
        interval_value = (user.subscription_interval or "").lower() if user else ""
        if plan_value in {"monthly", "yearly"} and not interval_value:
            interval_value = "year" if plan_value == "yearly" else "month"
            plan_value = "pro"
        if not plan_value and interval_value:
            plan_value = "pro"
        cancel_at = user.subscription_cancel_at if user else None
        cancel_at_period_end = user.subscription_cancel_at_period_end if user else None
        return {
            "active": active,
            "enabled": self.enabled,
            "self_hosted": self.self_hosted,
            "billing_exempt": bool(user.billing_exempt) if user else False,
            "status": user.subscription_status if user else None,
            "plan": plan_value or None,
            "plan_interval": interval_value or None,
            "current_period_end": user.subscription_current_period_end if user else None,
            "cancel_at": cancel_at,
            "cancel_at_period_end": cancel_at_period_end,
        }
