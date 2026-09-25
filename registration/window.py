"""Registration open/closed window.

Close time is 12:00 noon Darwin by default. To reopen later without
reverting this work, set REGISTRATION_OPEN=true in the environment
(for example: flyctl secrets set REGISTRATION_OPEN=true).
To force it closed even before the deadline: REGISTRATION_OPEN=false.
"""

from datetime import datetime

from django.conf import settings
from django.utils import timezone
from django.utils.dateparse import parse_datetime


def registration_closes_at():
    raw = getattr(settings, "REGISTRATION_CLOSES_AT", "") or "2026-09-25T12:00:00+09:30"
    closes = parse_datetime(raw)
    if closes is None:
        closes = datetime.fromisoformat(raw)
    if timezone.is_naive(closes):
        closes = timezone.make_aware(closes, timezone.get_current_timezone())
    return closes


def registration_is_open() -> bool:
    override = (getattr(settings, "REGISTRATION_OPEN_OVERRIDE", "") or "").strip().lower()
    if override in {"1", "true", "yes", "on"}:
        return True
    if override in {"0", "false", "no", "off"}:
        return False
    return timezone.now() < registration_closes_at()


CLOSED_MESSAGE = (
    "Registration is closed. New team entries are no longer being accepted. "
    "If you already registered, the organisers have your entry."
)
