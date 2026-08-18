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
        self.assertContains(response, "Register Your Team")

    def test_valid_submission_is_saved(self):
        response = self.post_registration()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

        self.assertEqual(TeamRegistration.objects.count(), 1)
        team = TeamRegistration.objects.get()
        self.assertEqual(team.team_name, "Test Tigers")
        self.assertEqual(team.gmail, "testtigers@gmail.com")
        self.assertEqual(team.tournament, "Dashain Cup 2026")

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
