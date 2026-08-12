"""Email helpers for team registrations.

All auto-reply / notification emails are sent through Django's normal
email backend, configured (see settings.py + README.md) to use the
tournament's Gmail account over SMTP with an "app password". No extra
services or paid APIs are needed.
"""

import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)


def _display_context(registration):
    squad_size_display = (
        registration.get_squad_size_display() if registration.squad_size else "Not specified"
    )
    return {
        "registration": registration,
        "club_name": settings.CLUB_NAME,
        "squad_size_display": squad_size_display,
        "experience_display": registration.experience or "N/A",
        "notes_display": registration.notes or "N/A",
    }


def email_is_configured() -> bool:
    """True once real SMTP credentials have been set (see .env)."""
    return bool(settings.EMAIL_HOST_USER and settings.EMAIL_HOST_PASSWORD)


def send_confirmation_email(registration) -> bool:
    """Auto-reply sent to the registering team's own Gmail address."""
    if not email_is_configured():
        logger.warning(
            "Skipping confirmation email for %s — EMAIL_HOST_USER/EMAIL_HOST_PASSWORD not set.",
            registration.team_name,
        )
        return False

    context = _display_context(registration)
    subject = f"{settings.CLUB_NAME} — {registration.tournament} Registration Received"
    text_body = render_to_string("registration/emails/confirmation.txt", context)
    html_body = render_to_string("registration/emails/confirmation.html", context)

    message = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[registration.gmail],
    )
    message.attach_alternative(html_body, "text/html")

    try:
        message.send(fail_silently=False)
        return True
    except Exception:
        logger.exception("Failed to send confirmation email for %s", registration.team_name)
        return False


def send_organiser_notification(registration) -> bool:
    """Notifies the tournament organiser inbox of a new registration."""
    if not email_is_configured() or not settings.ORGANISER_EMAIL:
        logger.warning(
            "Skipping organiser notification for %s — email not configured or ORGANISER_EMAIL unset.",
            registration.team_name,
        )
        return False

    context = _display_context(registration)
    context["admin_url"] = f"{settings.SITE_URL}/admin/registration/teamregistration/{registration.pk}/change/"

    subject = f"New team registered: {registration.team_name} ({registration.tournament})"
    text_body = render_to_string("registration/emails/organiser_notification.txt", context)

    message = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[settings.ORGANISER_EMAIL],
    )

    try:
        message.send(fail_silently=False)
        return True
    except Exception:
        logger.exception("Failed to send organiser notification for %s", registration.team_name)
        return False
