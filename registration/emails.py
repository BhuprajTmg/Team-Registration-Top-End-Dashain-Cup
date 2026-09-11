"""Email helpers for team registrations.

All auto-reply / notification emails are sent through Django's normal
email backend, configured (see settings.py + README.md) to use the
tournament's Gmail account over SMTP with an "app password". No extra
services or paid APIs are needed.
"""

import logging
from concurrent.futures import ThreadPoolExecutor

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import close_old_connections
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)
_email_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="registration-email")

EMAIL_TROUBLESHOOTING_HINT = (
    "Check that EMAIL_HOST_USER is the tournament's Gmail address and that "
    "EMAIL_HOST_PASSWORD is a 16-character Gmail App Password (not the normal "
    "account password), which requires 2-Step Verification to be enabled. "
    "Run `python manage.py check_email <your-address@gmail.com>` to test the "
    "setup directly."
)


def _display_context(registration):
    squad_size_display = (
        registration.get_squad_size_display() if registration.squad_size else "Not specified"
    )
    players = registration.players or []
    players_display = []
    for p in players:
        name = p.get("name")
        if not name:
            continue
        label = name
        if p.get("phone"):
            label = f"{label} ({p.get('phone')})"
        if p.get("gmail"):
            label = f"{label} <{p.get('gmail')}>"
        if p.get("mpl"):
            label = f"{label} [Premier]"
        players_display.append(label)
    return {
        "registration": registration,
        "club_name": settings.CLUB_NAME,
        "squad_size_display": squad_size_display,
        "experience_display": registration.experience or "N/A",
        "notes_display": registration.notes or "N/A",
        "category_display": registration.get_category_display(),
        "players": players,
        "players_display": players_display,
        "players_display_text": ", ".join(players_display) if players_display else "Not listed",
        "payment_url": (
            settings.PUBLIC_SITE_URL.rstrip("/") + registration.payment_path()
            if getattr(settings, "PUBLIC_SITE_URL", "")
            else registration.payment_path()
        ),
        "entry_fee": getattr(settings, "ENTRY_FEE_AUD", 349),
        "bank_account_name": getattr(settings, "BANK_ACCOUNT_NAME", "Gurkhali FC"),
        "bank_bsb": getattr(settings, "BANK_BSB", "015901"),
        "bank_account_number": getattr(settings, "BANK_ACCOUNT_NUMBER", "812044156"),
        "has_payment_receipt": bool(getattr(registration, "has_payment_receipt", False)),
    }


def _attach_payment_receipt(message, registration) -> None:
    """Attach the PayID screenshot to the organiser email only."""
    receipt = getattr(registration, "payment_receipt", None)
    if not receipt:
        return
    filename = registration.payment_receipt_filename or "payment-receipt.jpg"
    content_type = registration.payment_receipt_content_type or "image/jpeg"
    message.attach(filename, bytes(receipt), content_type)


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
    except Exception as exc:
        logger.error(
            "Failed to send the confirmation email for %s to %s: %s\n%s",
            registration.team_name,
            registration.gmail,
            exc,
            EMAIL_TROUBLESHOOTING_HINT,
            exc_info=True,
        )
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

    subject = f"New team registered: {registration.team_name} ({registration.tournament})"
    text_body = render_to_string("registration/emails/organiser_notification.txt", context)
    html_body = render_to_string("registration/emails/organiser_notification.html", context)

    message = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[settings.ORGANISER_EMAIL],
    )
    message.attach_alternative(html_body, "text/html")
    _attach_payment_receipt(message, registration)

    try:
        message.send(fail_silently=False)
        return True
    except Exception as exc:
        logger.error(
            "Failed to send the organiser notification for %s: %s\n%s",
            registration.team_name,
            exc,
            EMAIL_TROUBLESHOOTING_HINT,
            exc_info=True,
        )
        return False


def deliver_registration_emails(registration_id: int) -> None:
    """Send both registration emails and persist their delivery outcomes."""
    from .models import TeamRegistration

    close_old_connections()
    try:
        registration = TeamRegistration.objects.get(pk=registration_id)
        confirmation_sent = send_confirmation_email(registration)
        organiser_notified = send_organiser_notification(registration)
        TeamRegistration.objects.filter(pk=registration_id).update(
            confirmation_email_sent=confirmation_sent,
            organiser_notified=organiser_notified,
        )
    except TeamRegistration.DoesNotExist:
        logger.warning(
            "Skipping registration emails because registration %s no longer exists.",
            registration_id,
        )
    except Exception:
        logger.exception(
            "Unexpected failure delivering registration emails for registration %s.",
            registration_id,
        )
    finally:
        close_old_connections()


def queue_registration_emails(registration_id: int) -> None:
    """Queue email delivery without holding up the registration response."""
    _email_executor.submit(deliver_registration_emails, registration_id)
