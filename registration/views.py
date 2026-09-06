import json
import re

from django import forms
from django.http import HttpResponse, HttpResponseNotFound, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import ensure_csrf_cookie

from .emails import email_is_configured, send_confirmation_email, send_organiser_notification
from .forms import TeamRegistrationForm, normalize_players
from .logos import parse_logo_payload
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


@method_decorator(ensure_csrf_cookie, name="get")
class IndexView(View):
    """Renders the landing page + registration form."""

    def get(self, request):
        return render(
            request,
            "registration/index.html",
            {
                "tournament": TOURNAMENT_NAME,
                "tournament_title": TOURNAMENT_TITLE,
                "tournament_year": TOURNAMENT_YEAR,
                "division": DIVISION_NAME,
            },
        )


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

    Saves the registration, then auto-replies to the team's Gmail address
    and notifies the organiser — both sent from the tournament's Gmail
    account configured in settings/`.env`.
    """

    def post(self, request):
        try:
            return self._register(request)
        except Exception:
            import logging

            logging.getLogger(__name__).exception("Unexpected registration failure")
            return JsonResponse(
                {
                    "status": "error",
                    "ok": False,
                    "message": (
                        "Something went wrong on the server while saving your registration. "
                        "Please try again in a moment."
                    ),
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
                payload.get("teamLogo") or payload.get("team_logo") or payload.get("logo")
            )
        except forms.ValidationError as exc:
            message = exc.messages[0] if getattr(exc, "messages", None) else str(exc)
            return JsonResponse(
                {"status": "error", "ok": False, "message": message}, status=400
            )

        registration = form.save(commit=False)
        registration.tournament = payload.get("tournament") or TOURNAMENT_NAME
        registration.division = payload.get("division") or DIVISION_NAME
        if logo_bytes:
            registration.logo = logo_bytes
            registration.logo_content_type = logo_type
            registration.logo_filename = logo_name
        registration.save()

        registration.confirmation_email_sent = send_confirmation_email(registration)
        registration.organiser_notified = send_organiser_notification(registration)
        registration.save(update_fields=["confirmation_email_sent", "organiser_notified"])

        if registration.confirmation_email_sent:
            message = (
                f"Thanks, {registration.team_name}! Your registration is in. A confirmation has "
                f"been sent to {registration.gmail}. Keep your PIN safe — you'll need it to edit "
                "this entry."
            )
        elif not email_is_configured():
            message = (
                f"Thanks, {registration.team_name}! Your registration was saved, but email "
                "notifications aren't configured yet — see README.md to connect the tournament "
                "Gmail account. Keep your PIN safe — you'll need it to edit this entry."
            )
        else:
            message = (
                f"Thanks, {registration.team_name}! Your registration is saved and safe, but we "
                "couldn't send your confirmation email just now. The organisers can see your entry "
                "and will be in touch. Keep your PIN safe — you'll need it to edit this entry."
            )

        return JsonResponse(
            {
                "status": "ok",
                "ok": True,
                "message": message,
                "confirmation_email_sent": registration.confirmation_email_sent,
                "team": registration.public_dict(),
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
