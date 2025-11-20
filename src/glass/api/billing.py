from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from stripe import SignatureVerificationError, StripeError

from ..auth.jwt import AuthenticatedUser, require_authenticated_user
from ..services.billing import BillingDisabledError, StripeService
from ..persistence.service import (
    clear_user_subscription,
    get_user_by_id,
    get_user_by_stripe_customer_id,
    get_user_by_stripe_subscription_id,
    update_user_subscription,
)
from ..utils.discord import send_discord_notification

router = APIRouter()

LOGGER = logging.getLogger(__name__)

CHECKOUT_COMPLETED_EVENTS = {
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
}
SUBSCRIPTION_EVENTS = {
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.pending_update_applied",
    "customer.subscription.pending_update_expired",
    "customer.subscription.paused",
    "customer.subscription.resumed",
}
INVOICE_EVENTS = {
    "invoice.paid",
    "invoice.payment_failed",
    "invoice.payment_action_required",
}
TERMINATED_SUBSCRIPTION_STATUSES = {"canceled", "cancelled", "unpaid", "incomplete_expired", "ended"}


class BillingPlanResponse(BaseModel):
    key: Literal["monthly", "yearly"]
    label: str
    amount_cents: int
    amount: float
    currency: str
    interval: Literal["month", "year"]


class BillingConfigResponse(BaseModel):
    enabled: bool
    provider: str
    self_hosted: bool
    plans: list[BillingPlanResponse]


class BillingStatusResponse(BaseModel):
    enabled: bool
    active: bool
    self_hosted: bool
    billing_exempt: bool
    status: str | None = None
    plan: str | None = None
    plan_interval: str | None = None
    current_period_end: datetime | None = None
    cancel_at: datetime | None = None
    cancel_at_period_end: bool | None = None


class CheckoutSessionRequest(BaseModel):
    plan: Literal["monthly", "yearly"]
    success_url: str | None = Field(
        default=None,
        description="Destination after a successful payment (defaults to /billing/success)",
    )
    cancel_url: str | None = Field(
        default=None,
        description="Destination when the customer closes Stripe (defaults to /billing)",
    )


class CheckoutSessionResponse(BaseModel):
    checkout_url: str
    session_id: str
    plan: str


class WebhookAcknowledgement(BaseModel):
    status: str


class PortalSessionRequest(BaseModel):
    return_url: str | None = Field(
        default=None,
        description="Destination after managing billing (defaults to /billing)",
    )


class PortalSessionResponse(BaseModel):
    portal_url: str


def _billing_service(request: Request) -> StripeService:
    return request.app.state.app_state.billing_service


@router.get("/billing/config", response_model=BillingConfigResponse)
async def billing_config(request: Request) -> BillingConfigResponse:
    svc = _billing_service(request)
    payload = svc.config_payload()
    return BillingConfigResponse(**payload)


@router.get("/billing/status", response_model=BillingStatusResponse)
async def billing_status(
    request: Request,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> BillingStatusResponse:
    db = request.app.state.history_store
    account_user = await get_user_by_id(db, user.user_id)
    if not account_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    svc = _billing_service(request)
    payload = svc.user_status_payload(account_user)
    return BillingStatusResponse(**payload)


@router.post("/billing/checkout", response_model=CheckoutSessionResponse)
async def create_checkout_session(
    request: Request,
    payload: CheckoutSessionRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> CheckoutSessionResponse:
    svc = _billing_service(request)
    if not svc.enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Billing is disabled")

    db = request.app.state.history_store
    account_user = await get_user_by_id(db, user.user_id)
    if not account_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not account_user.email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required for billing")

    settings = request.app.state.app_state.settings
    success_url = payload.success_url or f"{settings.frontend_url}/billing/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = payload.cancel_url or f"{settings.frontend_url}/billing"

    try:
        session = await svc.create_checkout_session(
            user_id=account_user.id,
            customer_email=account_user.email,
            plan_key=payload.plan,
            success_url=success_url,
            cancel_url=cancel_url,
            customer_id=account_user.stripe_customer_id,
        )
    except BillingDisabledError as exc:  # pragma: no cover - guarded above
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except StripeError as exc:  # pragma: no cover - network failure
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Stripe error") from exc

    if session.customer and session.customer != account_user.stripe_customer_id:
        await update_user_subscription(
            db,
            user_id=account_user.id,
            stripe_customer_id=str(session.customer),
        )

    return CheckoutSessionResponse(checkout_url=session.url, session_id=session.id, plan=payload.plan)


@router.post("/billing/portal", response_model=PortalSessionResponse)
async def create_billing_portal_session(
    request: Request,
    payload: PortalSessionRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> PortalSessionResponse:
    svc = _billing_service(request)
    if not svc.enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Billing is disabled")

    db = request.app.state.history_store
    account_user = await get_user_by_id(db, user.user_id)
    if not account_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not account_user.stripe_customer_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No billing customer found")

    settings = request.app.state.app_state.settings
    return_url = payload.return_url or f"{settings.frontend_url}/billing"

    try:
        session = await svc.create_billing_portal_session(
            customer_id=account_user.stripe_customer_id,
            return_url=return_url,
        )
    except BillingDisabledError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except StripeError as exc:  # pragma: no cover - network failure
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Stripe error") from exc

    return PortalSessionResponse(portal_url=session.url)


@router.post("/billing/stripe/webhook", response_model=WebhookAcknowledgement)
async def stripe_webhook(request: Request) -> WebhookAcknowledgement:
    svc = _billing_service(request)
    if not svc.enabled:
        # Stripe still tries to hit previously configured endpoints. Pretend it does not exist.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    settings = request.app.state.app_state.settings
    discord_webhook = settings.discord_webhook_url

    payload = await request.body()
    signature = request.headers.get("stripe-signature")
    try:
        event = svc.parse_event(payload, signature)
    except (ValueError, BillingDisabledError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except SignatureVerificationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature") from exc

    db = request.app.state.history_store
    data = _object_to_dict(event.get("data"))
    obj = _object_to_dict(data.get("object"))
    event_type = str(event.get("type") or "")

    if event_type in CHECKOUT_COMPLETED_EVENTS:
        await _handle_checkout_completed(db, svc, obj, discord_webhook)
    elif event_type in SUBSCRIPTION_EVENTS:
        await _handle_subscription_event(db, svc, obj)
    elif event_type in INVOICE_EVENTS:
        await _handle_invoice_event(db, svc, obj)
    else:
        LOGGER.debug("Received unsupported Stripe event type: %s", event_type)

    return WebhookAcknowledgement(status="ok")


async def _handle_checkout_completed(
    db,
    svc: StripeService,
    payload: Any,
    discord_webhook: str | None,
) -> None:
    payload_dict = _object_to_dict(payload)
    metadata = payload_dict.get("metadata", {}) if isinstance(payload_dict.get("metadata"), dict) else {}
    user_id = payload_dict.get("client_reference_id") or metadata.get("user_id")
    if not user_id:
        return
    subscription_id = payload_dict.get("subscription")
    extra_kwargs: dict[str, Any] = {}
    if payload_dict.get("customer"):
        extra_kwargs["stripe_customer_id"] = str(payload_dict["customer"])
    sub_payload: dict[str, Any] = {}
    if subscription_id:
        try:
            subscription = await svc.retrieve_subscription(str(subscription_id))
        except StripeError as exc:  # pragma: no cover - network failure
            LOGGER.error("Failed to retrieve subscription %s: %s", subscription_id, exc)
            return
        raw = _object_to_dict(subscription)
        sub_payload = svc.subscription_payload(raw)
        await _persist_subscription_update(
            db,
            user_id=user_id,
            sub_payload=sub_payload,
            extra_fields=extra_kwargs or None,
        )
    elif extra_kwargs:
        await update_user_subscription(db, user_id=user_id, **extra_kwargs)

    account_user = await get_user_by_id(db, user_id)
    if account_user:
        plan_name = (
            (sub_payload.get("plan") if subscription_id else metadata.get("plan"))
            or metadata.get("plan_key")
            or "unknown"
        )
        interval = sub_payload.get("plan_interval") or metadata.get("plan_interval")
        amount_total = payload_dict.get("amount_total")
        currency_code = (payload_dict.get("currency") or "USD").upper()
        if isinstance(amount_total, (int, float)):
            amount_value = f"{amount_total / 100:.2f} {currency_code}"
        else:
            amount_value = "—"
        await send_discord_notification(
            discord_webhook,
            embeds=[
                {
                    "title": "💸 Plan Purchased",
                    "color": 0xFACC15,
                    "fields": [
                        {
                            "name": "User",
                            "value": f"{account_user.name or 'Unknown'} ({account_user.email})",
                            "inline": False,
                        },
                        {"name": "Plan", "value": plan_name, "inline": True},
                        {"name": "Interval", "value": interval or "—", "inline": True},
                        {"name": "Amount", "value": amount_value, "inline": True},
                    ],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            ],
        )


async def _handle_subscription_event(db, svc: StripeService, payload: Any) -> None:
    payload_dict = _object_to_dict(payload)
    subscription_id = payload_dict.get("id")
    if not subscription_id:
        return
    user = payload_dict.get("metadata", {}).get("user_id")
    if not user:
        # Fallback to lookup by stored subscription id
        account_user = await get_user_by_stripe_subscription_id(db, subscription_id)
    else:
        account_user = await get_user_by_id(db, user)
    if not account_user:
        return

    sub_payload = svc.subscription_payload(payload_dict)
    await _persist_subscription_update(db, user_id=account_user.id, sub_payload=sub_payload)


async def _handle_invoice_event(db, svc: StripeService, payload: Any) -> None:
    payload_dict = _object_to_dict(payload)
    subscription_id = payload_dict.get("subscription")
    customer_id = payload_dict.get("customer")
    account_user = None
    if subscription_id:
        account_user = await get_user_by_stripe_subscription_id(db, subscription_id)
    if not account_user and customer_id:
        account_user = await get_user_by_stripe_customer_id(db, str(customer_id))
    if not account_user:
        return

    extra_kwargs = {"stripe_customer_id": str(customer_id)} if customer_id else None
    if not subscription_id:
        if extra_kwargs:
            await update_user_subscription(db, user_id=account_user.id, **extra_kwargs)
        return

    try:
        subscription = await svc.retrieve_subscription(str(subscription_id))
    except StripeError as exc:  # pragma: no cover - network failure
        LOGGER.error("Failed to retrieve subscription %s for invoice: %s", subscription_id, exc)
        return
    raw = _object_to_dict(subscription)
    sub_payload = svc.subscription_payload(raw)
    await _persist_subscription_update(
        db,
        user_id=account_user.id,
        sub_payload=sub_payload,
        extra_fields=extra_kwargs,
    )


async def _persist_subscription_update(
    db,
    *,
    user_id: str,
    sub_payload: dict[str, Any],
    extra_fields: dict[str, Any] | None = None,
) -> None:
    if not sub_payload and not extra_fields:
        return
    extra_kwargs = dict(extra_fields or {})
    status = str(sub_payload.get("status") or "").lower()
    if status and status in TERMINATED_SUBSCRIPTION_STATUSES:
        if extra_kwargs:
            await update_user_subscription(db, user_id=user_id, **extra_kwargs)
        await clear_user_subscription(db, user_id=user_id)
        return

    kwargs: dict[str, Any] = {}
    if sub_payload.get("subscription_id"):
        kwargs["stripe_subscription_id"] = sub_payload["subscription_id"]
    if sub_payload.get("status"):
        kwargs["subscription_status"] = sub_payload["status"]
    if sub_payload.get("plan"):
        kwargs["subscription_plan"] = sub_payload["plan"]
    if sub_payload.get("plan_interval"):
        kwargs["subscription_interval"] = sub_payload["plan_interval"]
    if sub_payload.get("current_period_end") is not None:
        kwargs["current_period_end"] = sub_payload["current_period_end"]
    if sub_payload.get("customer_id"):
        kwargs["stripe_customer_id"] = sub_payload["customer_id"]
    if sub_payload.get("cancel_at") is not None:
        kwargs["cancel_at"] = sub_payload["cancel_at"]
    if sub_payload.get("cancel_at_period_end") is not None:
        kwargs["cancel_at_period_end"] = sub_payload["cancel_at_period_end"]
    kwargs.update(extra_kwargs)
    if kwargs:
        await update_user_subscription(db, user_id=user_id, **kwargs)


def _object_to_dict(payload: Any) -> dict[str, Any]:
    if isinstance(payload, dict):
        return payload
    if payload is None:
        return {}
    to_dict = getattr(payload, "to_dict", None)
    if callable(to_dict):
        try:
            return to_dict()
        except TypeError:
            return {}
    try:
        return dict(payload)  # type: ignore[arg-type]
    except Exception:  # pragma: no cover - defensive
        return {}
