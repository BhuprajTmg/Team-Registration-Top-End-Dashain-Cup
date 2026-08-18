import json

from django.http import JsonResponse
from django.shortcuts import render
from django.views import View
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator

from .emails import email_is_configured, send_confirmation_email, send_organiser_notification
from .forms import TeamRegistrationForm

TOURNAMENT_TITLE = "Dashain Cup"
TOURNAMENT_YEAR = "2026"
TOURNAMENT_NAME = f"{TOURNAMENT_TITLE} {TOURNAMENT_YEAR}"
DIVISION_NAME = "Open 7A-side football competition"


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


class RegisterView(View):
    """
    JSON endpoint the front-end form submits to.

    Saves the registration, then auto-replies to the team's Gmail address
    and notifies the organiser — both sent from the tournament's Gmail
    account configured in settings/`.env`.
    """

    def post(self, request):
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return JsonResponse(
                {"status": "error", "message": "Invalid request body."}, status=400
            )

        form = TeamRegistrationForm(payload)

        if not form.is_valid():
            first_error = next(iter(form.errors.values()))[0]
            return JsonResponse({"status": "error", "message": first_error}, status=400)

        registration = form.save(commit=False)
        registration.tournament = payload.get("tournament") or TOURNAMENT_NAME
        registration.division = payload.get("division") or DIVISION_NAME
        registration.save()

        registration.confirmation_email_sent = send_confirmation_email(registration)
        registration.organiser_notified = send_organiser_notification(registration)
        registration.save(update_fields=["confirmation_email_sent", "organiser_notified"])

        if registration.confirmation_email_sent:
            message = (
                f"Thanks, {registration.team_name}! Your registration is in. A confirmation has "
                f"been sent to {registration.gmail}."
            )
        elif not email_is_configured():
            message = (
                f"Thanks, {registration.team_name}! Your registration was saved, but email "
                "notifications aren't configured yet — see README.md to connect the tournament "
                "Gmail account."
            )
        else:
            # Saved, but Gmail rejected the send — never claim an email went out
            # that didn't. The organiser gets the details from the admin instead.
            message = (
                f"Thanks, {registration.team_name}! Your registration is saved and safe, but we "
                "couldn't send your confirmation email just now. The organisers can see your entry "
                "and will be in touch."
            )

        return JsonResponse(
            {
                "status": "ok",
                "message": message,
                "confirmation_email_sent": registration.confirmation_email_sent,
            }
        )
