"""Diagnose the tournament Gmail setup by sending one real test email."""

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.core.management.base import BaseCommand, CommandError

from registration.emails import EMAIL_TROUBLESHOOTING_HINT, email_is_configured


class Command(BaseCommand):
    help = (
        "Send a test email to check that the tournament Gmail account is set up "
        "correctly for registration auto-replies."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "recipient",
            help="Address to send the test email to (e.g. your own Gmail address).",
        )

    def handle(self, *args, **options):
        recipient = options["recipient"]

        self.stdout.write("Email configuration currently in use:")
        self.stdout.write(f"  EMAIL_BACKEND      {settings.EMAIL_BACKEND}")
        self.stdout.write(f"  EMAIL_HOST         {settings.EMAIL_HOST}:{settings.EMAIL_PORT}")
        self.stdout.write(f"  EMAIL_HOST_USER    {settings.EMAIL_HOST_USER or '(not set)'}")
        self.stdout.write(
            f"  EMAIL_HOST_PASSWORD {'set (' + str(len(settings.EMAIL_HOST_PASSWORD)) + ' characters)' if settings.EMAIL_HOST_PASSWORD else '(not set)'}"
        )
        self.stdout.write(f"  DEFAULT_FROM_EMAIL {settings.DEFAULT_FROM_EMAIL}")
        self.stdout.write(f"  ORGANISER_EMAIL    {settings.ORGANISER_EMAIL or '(not set)'}")
        self.stdout.write("")

        if not email_is_configured():
            raise CommandError(
                "EMAIL_HOST_USER and/or EMAIL_HOST_PASSWORD are not set, so no real email "
                "can be sent yet. Add them to your .env file.\n" + EMAIL_TROUBLESHOOTING_HINT
            )

        if settings.EMAIL_HOST_PASSWORD and len(settings.EMAIL_HOST_PASSWORD.replace(" ", "")) != 16:
            self.stdout.write(
                self.style.WARNING(
                    "Heads up: Gmail App Passwords are exactly 16 characters. Yours isn't, "
                    "which usually means a normal account password was used by mistake."
                )
            )

        message = EmailMultiAlternatives(
            subject=f"{settings.CLUB_NAME} — test email",
            body=(
                "This is a test email from your Dashain Cup registration site.\n\n"
                "If you received it, registration confirmation emails will work."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[recipient],
        )

        self.stdout.write(f"Sending a test email to {recipient} ...")

        try:
            message.send(fail_silently=False)
        except Exception as exc:
            raise CommandError(
                f"Sending failed: {exc.__class__.__name__}: {exc}\n\n{EMAIL_TROUBLESHOOTING_HINT}"
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Test email sent to {recipient}. Check the inbox (and the spam folder). "
                "Registration confirmation emails will work with this configuration."
            )
        )
