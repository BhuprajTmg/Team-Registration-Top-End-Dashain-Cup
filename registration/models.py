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
    manager_name = models.CharField("Manager / Coach name", max_length=120)
    home_city = models.CharField("Home city / suburb", max_length=120)
    phone = models.CharField(max_length=40)
    gmail = models.EmailField("Team Gmail address")
    squad_size = models.CharField(
        max_length=10, choices=SQUAD_SIZE_CHOICES, blank=True
    )
    experience = models.TextField(
        "Previous tournament experience", blank=True, default=""
    )
    notes = models.TextField(blank=True, default="")

    confirmation_email_sent = models.BooleanField(default=False)
    organiser_notified = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Team registration"
        verbose_name_plural = "Team registrations"

    def __str__(self):
        return f"{self.team_name} ({self.tournament})"
