"""Email service using Resend API."""

from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)


class EmailService:
    """Service for sending emails using Resend API."""
    
    def __init__(
        self, 
        api_key: str | None, 
        from_email: str = "Glass <hello@updates.speakglass.com>",
        verification_template_id: str | None = None,
        password_reset_template_id: str | None = None,
    ):
        """Initialize email service.
        
        Args:
            api_key: Resend API key. If None, emails won't be sent.
            from_email: Email address to send from
            verification_template_id: Resend template ID for verification emails
            password_reset_template_id: Resend template ID for password reset emails
        """
        self.api_key = api_key
        self.from_email = from_email
        self.verification_template_id = verification_template_id
        self.password_reset_template_id = password_reset_template_id
        self.enabled = api_key is not None
        
        if not self.enabled:
            logger.info("[Email] Resend API key not configured - email sending disabled")
    
    async def send_email(
        self,
        to: str,
        subject: str | None = None,
        html: str | None = None,
        text: str | None = None,
        template_id: str | None = None,
        template_data: dict | None = None,
    ) -> bool:
        """Send an email using Resend API.
        
        Args:
            to: Recipient email address
            subject: Email subject (required if not using template)
            html: HTML email body (optional if using template)
            text: Plain text email body (optional)
            template_id: Resend template ID (optional)
            template_data: Template variables (optional, used with template_id)
            
        Returns:
            True if email was sent successfully, False otherwise
        """
        if not self.enabled:
            logger.warning(f"[Email] Cannot send email - Resend API key not configured (to={to})")
            return False
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                payload: dict = {
                    "from": self.from_email,
                    "to": [to],
                }
                
                # Use template if provided (template has subject/html built-in)
                if template_id:
                    payload["template"] = {
                        "id": template_id,
                        "variables": template_data or {},
                    }
                else:
                    # Use inline HTML/text (requires subject)
                    if subject:
                        payload["subject"] = subject
                    if html:
                        payload["html"] = html
                    if text:
                        payload["text"] = text
                
                response = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                
                if response.status_code == 200:
                    logger.info(f"[Email] Successfully sent email to {to}")
                    return True
                else:
                    logger.error(f"[Email] Failed to send email to {to}: {response.status_code} {response.text}")
                    return False
                    
        except Exception as e:
            logger.error(f"[Email] Error sending email to {to}: {e}")
            return False
    
    async def send_verification_email(
        self,
        to: str,
        name: str | None,
        verification_url: str,
    ) -> bool:
        """Send email verification email using Resend template.
        
        Args:
            to: Recipient email address
            name: User's name (optional)
            verification_url: URL to verify email
            
        Returns:
            True if email was sent successfully
        """
        if not self.verification_template_id:
            logger.error("[Email] Verification template ID not configured")
            return False
        
        return await self.send_email(
            to=to,
            template_id=self.verification_template_id,
            template_data={
                "name": name or "there",
                "verification_url": verification_url,
            },
        )
    
    async def send_password_reset_email(
        self,
        to: str,
        name: str | None,
        reset_url: str,
    ) -> bool:
        """Send password reset email using Resend template.
        
        Args:
            to: Recipient email address
            name: User's name (optional)
            reset_url: URL to reset password
            
        Returns:
            True if email was sent successfully
        """
        if not self.password_reset_template_id:
            logger.error("[Email] Password reset template ID not configured")
            return False
        
        return await self.send_email(
            to=to,
            template_id=self.password_reset_template_id,
            template_data={
                "name": name or "there",
                "reset_url": reset_url,
            },
        )

