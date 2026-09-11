import json
import re

from django import forms
from django.conf import settings
from django.http import HttpResponse, HttpResponseForbidden, HttpResponseNotFound, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import ensure_csrf_cookie

from .emails import (
    email_is_configured,
    queue_registration_emails,
    send_confirmation_email,
    send_organiser_notification,
)
from .forms import TeamRegistrationForm, normalize_australian_phone, normalize_players
from .logos import parse_logo_payload, parse_receipt_payload
from .models import TeamRegistration

TOURNAMENT_TITLE = "Dashain Cup"
TOURNAMENT_YEAR = "2026"
TOURNAMENT_NAME = f"{TOURNAMENT_TITLE} {TOURNAMENT_YEAR}"
DIVISION_NAME = "Open 7A-side football competition"


def _parse_json(request):
    try:
        return json.loads(request.body.decode("utf-8")), None
    except (ValueError, UnicodeDecodeError):
        return None, JsonResponse(
            {"status": "error", "ok": False, "message": "Invalid request body."},
            status=400,
        )


def _payment_page_context(team=None):
    return {
        "tournament": TOURNAMENT_NAME,
        "tournament_title": TOURNAMENT_TITLE,
        "tournament_year": TOURNAMENT_YEAR,
        "division": DIVISION_NAME,
        "entry_fee": settings.ENTRY_FEE_AUD,
        "payid_name": settings.PAYID_NAME,
        "payid_value": settings.PAYID_VALUE,
        "payid_type": settings.PAYID_TYPE,
        "team": team,
    }


@method_decorator(ensure_csrf_cookie, name="get")
class IndexView(View):
    """Renders the landing page + registration form."""

    def get(self, request):
        return render(request, "registration/index.html", _payment_page_context())


class TeamListView(View):
    """Public list of registered teams (no PIN / Gmail)."""

    def get(self, request):
        teams = [team.public_dict() for team in TeamRegistration.objects.all()]
        return JsonResponse({"ok": True, "teams": teams})


class TeamLogoView(View):
    """Serves a stored team logo from the database."""

    def get(self, request, pk):
        team = get_object_or_404(TeamRegistration, pk=pk)
        if not team.has_logo:
            return HttpResponseNotFound("No logo uploaded for this team.")
        response = HttpResponse(
            bytes(team.logo),
            content_type=team.logo_content_type or "application/octet-stream",
        )
        response["Cache-Control"] = "public, max-age=86400"
        if team.logo_filename:
            response["Content-Disposition"] = f'inline; filename="{team.logo_filename}"'
        return response


class RegisterView(View):
    """
    JSON endpoint the front-end form submits to.

    Saves the registration, then queues an auto-reply to the team's Gmail
    address and an organiser notification. Email delivery does not delay the
    production response.
    """

    def post(self, request):
        try:
            return self._register(request)
        except Exception as exc:
            import logging

            logging.getLogger(__name__).exception("Unexpected registration failure")
            message = (
                "Something went wrong on the server while saving your registration. "
                "Please try again in a moment."
            )
            exc_name = type(exc).__name__
            if "OperationalError" in exc_name or "InterfaceError" in exc_name:
                message = (
                    "Could not connect to the database. For local testing, remove "
                    "DATABASE_URL from your .env (use SQLite), or check that your "
                    "Neon database is awake and reachable."
                )
            return JsonResponse(
                {
                    "status": "error",
                    "ok": False,
                    "message": message,
                },
                status=500,
            )

    def _register(self, request):
        payload, error = _parse_json(request)
        if error:
            return error

        # Accept either the new squad-form shape or the legacy field names.
        form_data = {
            "team_name": payload.get("team_name") or payload.get("teamName") or "",
            "manager_name": payload.get("manager_name")
            or payload.get("captainName")
            or "",
            "home_city": payload.get("home_city") or payload.get("homeCity") or "",
            "phone": payload.get("phone") or payload.get("contactPhone") or "",
            "gmail": payload.get("gmail") or "",
            "squad_size": payload.get("squad_size") or "",
            "experience": payload.get("experience") or "",
            "notes": payload.get("notes") or "",
            "agree": payload.get("agree"),
            "pin": payload.get("pin") or "",
            "players": payload.get("players") or [],
        }

        form = TeamRegistrationForm(form_data)

        if not form.is_valid():
            first_error = next(iter(form.errors.values()))[0]
            return JsonResponse(
                {"status": "error", "ok": False, "message": first_error}, status=400
            )

        try:
            logo_bytes, logo_type, logo_name = parse_logo_payload(
                payload.get("teamLogo") or payload.get("team_logo") or payload.get("logo"),
                required=True,
            )
        except forms.ValidationError as exc:
            message = exc.messages[0] if getattr(exc, "messages", None) else str(exc)
            return JsonResponse(
                {"status": "error", "ok": False, "message": message}, status=400
            )

        try:
            receipt_bytes, receipt_type, receipt_name = parse_receipt_payload(
                payload.get("receipt")
                or payload.get("screenshot")
                or payload.get("paymentReceipt"),
                required=True,
            )
        except forms.ValidationError as exc:
            message = exc.messages[0] if getattr(exc, "messages", None) else str(exc)
            return JsonResponse(
                {"status": "error", "ok": False, "message": message}, status=400
            )

        registration = form.save(commit=False)
        registration.tournament = payload.get("tournament") or TOURNAMENT_NAME
        registration.division = payload.get("division") or DIVISION_NAME
        registration.logo = logo_bytes
        registration.logo_content_type = logo_type
        registration.logo_filename = logo_name
        registration.payment_receipt = receipt_bytes
        registration.payment_receipt_content_type = receipt_type
        registration.payment_receipt_filename = receipt_name
        registration.mark_payment_received()
        registration.save()

        email_queued = False
        if settings.REGISTRATION_EMAIL_ASYNC and email_is_configured():
            queue_registration_emails(registration.pk)
            email_queued = True
            message = (
                f"Thanks, {registration.team_name}! Your registration is in. "
                f"A confirmation email is being sent to {registration.gmail}. "
                f"Your ${settings.ENTRY_FEE_AUD} PayID screenshot has been saved."
            )
        else:
            registration.confirmation_email_sent = send_confirmation_email(registration)
            registration.organiser_notified = send_organiser_notification(registration)
            registration.save(
                update_fields=["confirmation_email_sent", "organiser_notified"]
            )

            if registration.confirmation_email_sent:
                message = (
                    f"Thanks, {registration.team_name}! Your registration is in. A confirmation "
                    f"has been sent to {registration.gmail}. Your ${settings.ENTRY_FEE_AUD} "
                    "PayID screenshot has been saved."
                )
            elif not email_is_configured():
                message = (
                    f"Thanks, {registration.team_name}! Your registration was saved, but email "
                    "notifications aren't configured yet — see README.md to connect the tournament "
                    "Gmail account."
                )
            else:
                message = (
                    f"Thanks, {registration.team_name}! Your registration is saved and safe, but "
                    "we couldn't send your confirmation email just now. The organisers can see "
                    "your entry and will be in touch."
                )

        return JsonResponse(
            {
                "status": "ok",
                "ok": True,
                "message": message,
                "confirmation_email_sent": registration.confirmation_email_sent,
                "email_queued": email_queued,
                "team": registration.public_dict(),
                "paymentUrl": registration.payment_path(),
            }
        )


class TeamVerifyPinView(View):
    def post(self, request, pk):
        payload, error = _parse_json(request)
        if error:
            return error

        team = get_object_or_404(TeamRegistration, pk=pk)
        pin = str(payload.get("pin") or "").strip()
        if not re.fullmatch(r"\d{4}", pin) or not team.check_pin(pin):
            return JsonResponse(
                {"ok": False, "status": "error", "message": "That PIN is incorrect for this team."},
                status=403,
            )
        return JsonResponse({"ok": True, "status": "ok"})


class TeamUpdateView(View):
    def post(self, request, pk):
        payload, error = _parse_json(request)
        if error:
            return error

        team = get_object_or_404(TeamRegistration, pk=pk)
        pin = str(payload.get("pin") or "").strip()
        if not team.check_pin(pin):
            return JsonResponse(
                {"ok": False, "status": "error", "message": "That PIN is incorrect for this team."},
                status=403,
            )

        team_name = (payload.get("team_name") or payload.get("teamName") or "").strip()
        captain = (
            payload.get("manager_name") or payload.get("captainName") or ""
        ).strip()
        phone = (payload.get("phone") or payload.get("contactPhone") or "").strip()

        try:
            players = normalize_players(payload.get("players") or [])
            phone = normalize_australian_phone(phone)
        except forms.ValidationError as exc:
            message = exc.messages[0] if getattr(exc, "messages", None) else str(exc)
            return JsonResponse(
                {"ok": False, "status": "error", "message": message}, status=400
            )

        if not team_name or not captain or not phone:
            return JsonResponse(
                {
                    "ok": False,
                    "status": "error",
                    "message": "Team name, captain, and contact are required.",
                },
                status=400,
            )

        team.team_name = team_name
        team.manager_name = captain
        team.phone = phone
        team.players = players
        team.squad_size = TeamRegistration.squad_size_for_count(len(players))
        team.save(
            update_fields=[
                "team_name",
                "manager_name",
                "phone",
                "players",
                "squad_size",
            ]
        )
        return JsonResponse({"ok": True, "status": "ok", "team": team.public_dict()})


class TeamDeleteView(View):
    def post(self, request, pk):
        payload, error = _parse_json(request)
        if error:
            return error

        team = get_object_or_404(TeamRegistration, pk=pk)
        pin = str(payload.get("pin") or "").strip()
        if not team.check_pin(pin):
            return JsonResponse(
                {"ok": False, "status": "error", "message": "That PIN is incorrect for this team."},
                status=403,
            )

        team.delete()
        return JsonResponse({"ok": True, "status": "ok"})


@method_decorator(ensure_csrf_cookie, name="get")
class PaymentView(View):
    """PayID instructions plus bank-statement screenshot upload."""

    def get(self, request, token):
        team = get_object_or_404(TeamRegistration, payment_token=token)
        return render(request, "registration/payment.html", _payment_page_context(team))


class PaymentSubmitView(View):
    def post(self, request, token):
        team = get_object_or_404(TeamRegistration, payment_token=token)
        payload, error = _parse_json(request)
        if error:
            return error

        try:
            receipt_bytes, receipt_type, receipt_name = parse_receipt_payload(
                payload.get("receipt") or payload.get("screenshot") or payload.get("paymentReceipt"),
                required=True,
            )
        except forms.ValidationError as exc:
            message = exc.messages[0] if getattr(exc, "messages", None) else str(exc)
            return JsonResponse(
                {"status": "error", "ok": False, "message": message}, status=400
            )

        team.payment_receipt = receipt_bytes
        team.payment_receipt_content_type = receipt_type
        team.payment_receipt_filename = receipt_name
        team.mark_payment_received()
        team.save(
            update_fields=[
                "payment_receipt",
                "payment_receipt_content_type",
                "payment_receipt_filename",
                "payment_received_at",
            ]
        )
        return JsonResponse(
            {
                "status": "ok",
                "ok": True,
                "message": (
                    f"Thanks, {team.team_name}. Your ${settings.ENTRY_FEE_AUD} PayID "
                    "screenshot has been saved. The organisers will confirm the payment."
                ),
            }
        )


class TeamReceiptView(View):
    """Staff-only bank-statement screenshot for the admin portal."""

    def get(self, request, pk):
        if not request.user.is_staff:
            return HttpResponseForbidden("Staff login is required to view payment receipts.")
        team = get_object_or_404(TeamRegistration, pk=pk)
        if not team.has_payment_receipt:
            return HttpResponseNotFound("No payment screenshot uploaded for this team.")
        response = HttpResponse(
            bytes(team.payment_receipt),
            content_type=team.payment_receipt_content_type or "application/octet-stream",
        )
        if team.payment_receipt_filename:
            response["Content-Disposition"] = (
                f'inline; filename="{team.payment_receipt_filename}"'
            )
        return response
