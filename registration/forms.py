import re

from django import forms

from .models import TeamRegistration

MIN_PLAYERS = 7
MAX_PLAYERS = 12


def normalize_players(raw_players):
    """Validate and normalize a squad list from the registration / edit API."""
    if not isinstance(raw_players, list):
        raise forms.ValidationError("Squad list is required.")

    players = []
    mpl_count = 0
    for item in raw_players:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        jersey_raw = item.get("jersey")
        jersey = str(jersey_raw).strip() if jersey_raw not in (None, "") else None
        mpl = bool(item.get("mpl"))
        if name:
            if mpl:
                mpl_count += 1
            players.append({"name": name, "jersey": jersey, "mpl": mpl})

    if len(players) < MIN_PLAYERS:
        raise forms.ValidationError(
            f"You need at least {MIN_PLAYERS} players to register a 7-a-side squad."
        )
    if len(players) > MAX_PLAYERS:
        raise forms.ValidationError(
            f"A squad can have at most {MAX_PLAYERS} players."
        )
    if mpl_count > 3:
        raise forms.ValidationError(
            "A squad may include at most 3 current MPL players."
        )
    return players


class TeamRegistrationForm(forms.ModelForm):
    agree = forms.BooleanField(
        required=True,
        error_messages={
            "required": "Please confirm the details are accurate and accept the tournament rules."
        },
    )
    pin = forms.CharField(required=True, min_length=4, max_length=4)
    players = forms.Field(required=True)

    class Meta:
        model = TeamRegistration
        fields = [
            "team_name",
            "manager_name",
            "home_city",
            "phone",
            "gmail",
            "squad_size",
            "experience",
            "notes",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["home_city"].required = False
        self.fields["squad_size"].required = False
        self.fields["experience"].required = False
        self.fields["notes"].required = False

    def clean_gmail(self):
        gmail = self.cleaned_data["gmail"].strip().lower()
        if not gmail.endswith("@gmail.com"):
            raise forms.ValidationError(
                "Please use a Gmail address (must end with @gmail.com) so we can send your confirmation."
            )
        return gmail

    def clean_team_name(self):
        return self.cleaned_data["team_name"].strip()

    def clean_manager_name(self):
        return self.cleaned_data["manager_name"].strip()

    def clean_home_city(self):
        return (self.cleaned_data.get("home_city") or "").strip()

    def clean_phone(self):
        return self.cleaned_data["phone"].strip()

    def clean_pin(self):
        pin = self.cleaned_data["pin"].strip()
        if not re.fullmatch(r"\d{4}", pin):
            raise forms.ValidationError("Enter a 4-digit PIN.")
        return pin

    def clean_players(self):
        return normalize_players(self.cleaned_data.get("players"))

    def save(self, commit=True):
        instance = super().save(commit=False)
        players = self.cleaned_data["players"]
        instance.players = players
        instance.squad_size = TeamRegistration.squad_size_for_count(len(players))
        instance.set_pin(self.cleaned_data["pin"])
        if commit:
            instance.save()
        return instance
