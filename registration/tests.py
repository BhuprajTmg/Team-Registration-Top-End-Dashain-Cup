import json
import os
from smtplib import SMTPAuthenticationError
from unittest import mock

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.exceptions import ImproperlyConfigured
from django.test import TestCase, override_settings
from django.urls import reverse

from dashain_cup.settings import env_bool, env_int, env_str

from .models import TeamRegistration

SAMPLE_PLAYERS = [
    {"name": f"Player {i}", "jersey": str(i)} for i in range(1, 8)
]

VALID_PAYLOAD = {
    "team_name": "Test Tigers",
    "manager_name": "Sita Gurung",
    "home_city": "Darwin",
    "phone": "0400 000 000",
    "gmail": "testtigers@gmail.com",
    "squad_size": "10-12",
    "experience": "N/A",
    "notes": "N/A",
    "agree": True,
    "pin": "4821",
    "players": SAMPLE_PLAYERS,
}


class RegistrationEndpointTests(TestCase):
    def post_registration(self, **overrides):
        payload = {**VALID_PAYLOAD, **overrides}
        return self.client.post(
            reverse("registration:register"),
            data=json.dumps(payload),
            content_type="application/json",
        )

    def test_landing_page_loads(self):
        response = self.client.get(reverse("registration:index"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Register your team")
        self.assertContains(response, "Registered teams")
        self.assertContains(response, "Gurkhali FC presents")
        self.assertContains(response, "Team logo")

    def test_logo_upload_is_saved_and_served(self):
        # 1x1 PNG
        png_b64 = (
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        )
        response = self.post_registration(
            teamLogo=f"data:image/png;base64,{png_b64}"
        )
        self.assertEqual(response.status_code, 200)
        team = TeamRegistration.objects.get()
        self.assertTrue(team.has_logo)
        self.assertEqual(team.logo_content_type, "image/png")
        self.assertIn("logoUrl", response.json()["team"])

        logo = self.client.get(reverse("registration:team_logo", args=[team.pk]))
        self.assertEqual(logo.status_code, 200)
        self.assertEqual(logo["Content-Type"], "image/png")
        self.assertGreater(len(logo.content), 10)

    def test_valid_submission_is_saved(self):
        response = self.post_registration()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

        self.assertEqual(TeamRegistration.objects.count(), 1)
        team = TeamRegistration.objects.get()
        self.assertEqual(team.team_name, "Test Tigers")
        self.assertEqual(team.gmail, "testtigers@gmail.com")
        self.assertEqual(team.tournament, "Dashain Cup 2026")
        self.assertEqual(len(team.players), 7)
        self.assertTrue(team.check_pin("4821"))
        self.assertFalse(team.check_pin("0000"))
        self.assertEqual(team.squad_size, "7-9")

    def test_public_teams_list_hides_gmail_and_pin(self):
        self.post_registration()
        response = self.client.get(reverse("registration:teams"))
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["ok"])
        self.assertEqual(len(body["teams"]), 1)
        team = body["teams"][0]
        self.assertEqual(team["teamName"], "Test Tigers")
        self.assertNotIn("gmail", team)
        self.assertNotIn("pin", team)
        self.assertNotIn("pin_hash", team)

    def test_pin_unlock_and_update_flow(self):
        self.post_registration()
        team = TeamRegistration.objects.get()

        bad = self.client.post(
            reverse("registration:verify_pin", args=[team.pk]),
            data=json.dumps({"pin": "0000"}),
            content_type="application/json",
        )
        self.assertEqual(bad.status_code, 403)

        good = self.client.post(
            reverse("registration:verify_pin", args=[team.pk]),
            data=json.dumps({"pin": "4821"}),
            content_type="application/json",
        )
        self.assertEqual(good.status_code, 200)
        self.assertTrue(good.json()["ok"])

        new_players = [{"name": f"Updated {i}", "jersey": str(i)} for i in range(1, 9)]
        updated = self.client.post(
            reverse("registration:update_team", args=[team.pk]),
            data=json.dumps(
                {
                    "pin": "4821",
                    "teamName": "Updated Tigers",
                    "captainName": "Sita Gurung",
                    "contactPhone": "0400 111 111",
                    "players": new_players,
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(updated.status_code, 200)
        team.refresh_from_db()
        self.assertEqual(team.team_name, "Updated Tigers")
        self.assertEqual(len(team.players), 8)

    def test_pin_protected_delete(self):
        self.post_registration()
        team = TeamRegistration.objects.get()
        deleted = self.client.post(
            reverse("registration:delete_team", args=[team.pk]),
            data=json.dumps({"pin": "4821"}),
            content_type="application/json",
        )
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(TeamRegistration.objects.count(), 0)

    def test_too_few_players_is_rejected(self):
        response = self.post_registration(players=SAMPLE_PLAYERS[:3])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(TeamRegistration.objects.count(), 0)

    def test_too_many_mpl_players_is_rejected(self):
        players = [
            {"name": f"Player {i}", "jersey": str(i), "mpl": i <= 4}
            for i in range(1, 8)
        ]
        response = self.post_registration(players=players)
        self.assertEqual(response.status_code, 400)
        self.assertIn("MPL", response.json()["message"])
        self.assertEqual(TeamRegistration.objects.count(), 0)

    def test_mpl_flag_is_saved(self):
        players = [
            {"name": f"Player {i}", "jersey": str(i), "mpl": i <= 2}
            for i in range(1, 8)
        ]
        response = self.post_registration(players=players)
        self.assertEqual(response.status_code, 200)
        team = TeamRegistration.objects.get()
        self.assertEqual(sum(1 for p in team.players if p.get("mpl")), 2)

    def test_non_gmail_address_is_rejected(self):
        response = self.post_registration(gmail="team@yahoo.com")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["status"], "error")
        self.assertEqual(TeamRegistration.objects.count(), 0)

    def test_missing_required_field_is_rejected(self):
        response = self.post_registration(team_name="")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["status"], "error")
        self.assertEqual(TeamRegistration.objects.count(), 0)

    def test_agreement_is_required(self):
        response = self.post_registration(agree=False)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(TeamRegistration.objects.count(), 0)

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        EMAIL_HOST_USER="organiser@gmail.com",
        EMAIL_HOST_PASSWORD="app-password",
        ORGANISER_EMAIL="organiser@gmail.com",
    )
    def test_emails_are_sent_when_configured(self):
        response = self.post_registration()

        self.assertEqual(len(mail.outbox), 2)
        recipients = {address for message in mail.outbox for address in message.to}
        self.assertIn("testtigers@gmail.com", recipients)
        self.assertIn("organiser@gmail.com", recipients)

        team = TeamRegistration.objects.get()
        self.assertTrue(team.confirmation_email_sent)
        self.assertTrue(team.organiser_notified)

        body = response.json()
        self.assertTrue(body["confirmation_email_sent"])
        self.assertIn("confirmation has been sent", body["message"])

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        EMAIL_HOST_USER="organiser@gmail.com",
        EMAIL_HOST_PASSWORD="app-password",
        ORGANISER_EMAIL="organiser@gmail.com",
    )
    def test_emails_use_the_branded_html_template(self):
        self.post_registration()

        for message in mail.outbox:
            alternatives = dict((content_type, body) for body, content_type in message.alternatives)
            self.assertIn("text/html", alternatives, f"{message.subject} has no HTML version")
            self.assertIn("Gurkhali FC", alternatives["text/html"])

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        EMAIL_HOST_USER="organiser@gmail.com",
        EMAIL_HOST_PASSWORD="app-password",
        ORGANISER_EMAIL="organiser@gmail.com",
    )
    def test_emails_never_contain_an_admin_link(self):
        """The admin URL must not be shared with teams or organisers."""
        self.post_registration()

        self.assertEqual(len(mail.outbox), 2)
        for message in mail.outbox:
            bodies = [message.body] + [body for body, _ in message.alternatives]
            for body in bodies:
                self.assertNotIn("/admin/", body)

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend",
        EMAIL_HOST_USER="organiser@gmail.com",
        EMAIL_HOST_PASSWORD="wrong-password",
        ORGANISER_EMAIL="organiser@gmail.com",
    )
    def test_failed_send_does_not_claim_the_email_was_sent(self):
        """A wrong Gmail App Password must not produce a false success message."""
        with mock.patch(
            "django.core.mail.EmailMultiAlternatives.send",
            side_effect=SMTPAuthenticationError(535, b"Username and Password not accepted"),
        ):
            response = self.post_registration()

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertFalse(body["confirmation_email_sent"])
        self.assertNotIn("has been sent", body["message"])
        self.assertIn("couldn't send your confirmation email", body["message"])

        # The registration itself must still be saved and visible to organisers.
        team = TeamRegistration.objects.get()
        self.assertFalse(team.confirmation_email_sent)
        self.assertFalse(team.organiser_notified)


class EnvironmentParsingTests(TestCase):
    """`.env.example` invites blank values, so blanks must fall back to defaults."""

    def test_blank_string_falls_back_to_default(self):
        with mock.patch.dict(os.environ, {"SOME_SETTING": ""}):
            self.assertEqual(env_str("SOME_SETTING", "fallback"), "fallback")

    def test_whitespace_is_stripped(self):
        with mock.patch.dict(os.environ, {"SOME_SETTING": "  value  "}):
            self.assertEqual(env_str("SOME_SETTING"), "value")

    def test_blank_number_falls_back_instead_of_crashing(self):
        with mock.patch.dict(os.environ, {"SOME_PORT": ""}):
            self.assertEqual(env_int("SOME_PORT", 587), 587)

    def test_invalid_number_raises_a_clear_error(self):
        with mock.patch.dict(os.environ, {"SOME_PORT": "not-a-number"}):
            with self.assertRaises(ImproperlyConfigured):
                env_int("SOME_PORT", 587)

    def test_blank_boolean_falls_back_to_default(self):
        with mock.patch.dict(os.environ, {"SOME_FLAG": ""}):
            self.assertTrue(env_bool("SOME_FLAG", default=True))

    def test_app_password_spaces_are_stripped(self):
        """Google displays App Passwords as 'abcd efgh ijkl mnop'."""
        self.assertEqual(settings.EMAIL_HOST_PASSWORD, settings.EMAIL_HOST_PASSWORD.replace(" ", ""))


class AdminTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        get_user_model().objects.create_superuser(
            username="admin", email="admin@example.com", password="test-password-123"
        )
        cls.team = TeamRegistration.objects.create(
            team_name="Admin Visible FC",
            manager_name="Ram Thapa",
            home_city="Palmerston",
            phone="0411 111 111",
            gmail="adminvisible@gmail.com",
            squad_size="7-9",
            experience="N/A",
            notes="N/A",
        )

    def setUp(self):
        self.client.login(username="admin", password="test-password-123")

    def test_registration_appears_in_admin_changelist(self):
        response = self.client.get("/admin/registration/teamregistration/")

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Admin Visible FC")
        self.assertContains(response, "adminvisible@gmail.com")

    def test_changelist_shows_summary_counts(self):
        response = self.client.get("/admin/registration/teamregistration/")

        self.assertEqual(response.context["summary"]["total"], 1)
        self.assertContains(response, "Teams registered")

    def test_csv_export_action(self):
        response = self.client.post(
            "/admin/registration/teamregistration/",
            {"action": "export_as_csv", "_selected_action": [str(self.team.pk)]},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv")
        self.assertIn("Admin Visible FC", response.content.decode())
