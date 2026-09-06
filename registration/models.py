from django.contrib.auth.hashers import check_password, make_password
from django.db import models


class TeamRegistration(models.Model):
    """A single team's registration for a tournament."""

    SQUAD_SIZE_CHOICES = [
        ("", "Select squad size"),
        ("7-9", "7 – 9 players"),
        ("10-12", "10 – 12 players"),
        ("13-15", "13 – 15 players"),
        ("16+", "16+ players"),
    ]

    tournament = models.CharField(max_length=120, default="Dashain Cup 2026")
    division = models.CharField(
        max_length=160, default="Open 7A-side football competition"
    )

    team_name = models.CharField(max_length=120)
    manager_name = models.CharField("Captain name", max_length=120)
    home_city = models.CharField("Home city / suburb", max_length=120, blank=True, default="")
    phone = models.CharField(max_length=40)
    gmail = models.EmailField("Team Gmail address")
    squad_size = models.CharField(
        max_length=10, choices=SQUAD_SIZE_CHOICES, blank=True
    )
    experience = models.TextField(
        "Previous tournament experience", blank=True, default=""
    )
    notes = models.TextField(blank=True, default="")

    # Squad roster: [{"name": "...", "jersey": "10"|null, "mpl": bool}, ...]
    players = models.JSONField(default=list, blank=True)
    # Hashed 4-digit PIN used to edit / withdraw the registration publicly.
    pin_hash = models.CharField(max_length=128, blank=True, default="")

    # Required team logo stored in the DB so it survives Fly redeploys (no volume needed).
    logo = models.BinaryField(blank=True, null=True, editable=False)
    logo_content_type = models.CharField(max_length=64, blank=True, default="")
    logo_filename = models.CharField(max_length=255, blank=True, default="")

    confirmation_email_sent = models.BooleanField(default=False)
    organiser_notified = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Team registration"
        verbose_name_plural = "Team registrations"

    def __str__(self):
        return f"{self.team_name} ({self.tournament})"

    def set_pin(self, pin: str) -> None:
        self.pin_hash = make_password(str(pin).strip())

    def check_pin(self, pin: str) -> bool:
        if not self.pin_hash:
            return False
        return check_password(str(pin).strip(), self.pin_hash)

    @staticmethod
    def squad_size_for_count(count: int) -> str:
        if count <= 9:
            return "7-9"
        if count <= 12:
            return "10-12"
        if count <= 15:
            return "13-15"
        return "16+"

    @property
    def has_logo(self) -> bool:
        return bool(self.logo)

    def public_dict(self) -> dict:
        """Shape expected by the public teams list on the registration page."""
        return {
            "id": str(self.pk),
            "teamName": self.team_name,
            "captainName": self.manager_name,
            "contactPhone": self.phone,
            "players": self.players or [],
            "registeredAt": self.created_at.isoformat() if self.created_at else "",
            "logoUrl": f"/api/teams/{self.pk}/logo/" if self.has_logo else None,
        }
