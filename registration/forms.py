import re

from django import forms

from .models import TeamRegistration

MIN_PLAYERS = 8
MAX_PLAYERS = 12
MAX_PREMIER = 3
GMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@gmail\.com$", re.IGNORECASE)


def normalize_australian_phone(raw_phone):
    """Validate an Australian phone number and return a consistent format."""
    phone = str(raw_phone or "").strip()
    if not phone:
        raise forms.ValidationError("Enter a contact number.")

    compact = re.sub(r"[\s().-]", "", phone)
    if re.fullmatch(r"0[23478]\d{8}", compact):
        return compact
    if re.fullmatch(r"\+61[23478]\d{8}", compact):
        return "0" + compact[3:]

    raise forms.ValidationError(
        "Enter a valid Australian phone number, for example 0400 123 456 or +61 400 123 456."
    )


def normalize_players(raw_players):
    """Validate and normalize a squad list from the registration / edit API."""
    if not isinstance(raw_players, list):
        raise forms.ValidationError("Squad list is required.")

    players = []
    mpl_count = 0
    phones = []
    gmails = []
    for item in raw_players:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        phone_raw = item.get("phone") or item.get("jersey")
        phone = str(phone_raw).strip() if phone_raw not in (None, "") else ""
        gmail = str(item.get("gmail") or "").strip().lower()
        mpl = bool(item.get("mpl"))
        if not name and not phone and not gmail:
            continue
        if not name:
            raise forms.ValidationError("Every player needs a full name.")
        try:
            phone = normalize_australian_phone(phone)
        except forms.ValidationError:
            raise forms.ValidationError(
                "Every player needs a valid Australian phone number, numbers only."
            )
        if not GMAIL_RE.fullmatch(gmail):
            raise forms.ValidationError(
                "Every player needs a Gmail address ending in @gmail.com."
            )
        if phone in phones:
            raise forms.ValidationError(
                "Each player needs their own phone number."
            )
        if gmail in gmails:
            raise forms.ValidationError(
                "Each player needs their own Gmail address."
            )
        if mpl:
            mpl_count += 1
        phones.append(phone)
        gmails.append(gmail)
        players.append({"name": name, "phone": phone, "gmail": gmail, "mpl": mpl})

    if len(players) < MIN_PLAYERS:
        raise forms.ValidationError(
            f"You need at least {MIN_PLAYERS} players on the matchday squad."
        )
    if len(players) > MAX_PLAYERS:
        raise forms.ValidationError(
            f"A matchday squad can have at most {MAX_PLAYERS} players."
        )
    if mpl_count > MAX_PREMIER:
        raise forms.ValidationError(
            "A squad may include at most 3 Premier Players."
        )
    return players


class TeamRegistrationForm(forms.ModelForm):
    agree = forms.BooleanField(
        required=True,
        error_messages={
            "required": "Please confirm the details are accurate and accept the tournament rules."
        },
    )
    agree_terms = forms.BooleanField(
        required=True,
        error_messages={
            "required": "Please confirm you agree to the tournament Terms and Conditions."
        },
    )
    pin = forms.CharField(required=False, max_length=4)
    players = forms.Field(required=True)

    class Meta:
        model = TeamRegistration
        fields = [
            "team_name",
            "manager_name",
            "home_city",
            "phone",
            "gmail",
            "category",
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
        self.fields["category"].required = True
        self.fields["category"].choices = [
            ("", "Select Female, Kids, Men's or Veteran"),
            *TeamRegistration.CATEGORY_CHOICES,
        ]
        self.fields["category"].error_messages["required"] = (
            "Please select Female, Kids, Men's or Veteran."
        )
        self.fields["team_name"].error_messages["required"] = "Enter your team name."
        self.fields["manager_name"].error_messages["required"] = (
            "Enter the contact person's name."
        )
        self.fields["phone"].error_messages["required"] = "Enter a contact number."
        self.fields["gmail"].error_messages["required"] = (
            "Enter a Gmail address ending in @gmail.com."
        )
        self.fields["players"].error_messages["required"] = "Enter the full squad list."

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
        return normalize_australian_phone(self.cleaned_data["phone"])

    def clean_category(self):
        category = (self.cleaned_data.get("category") or "").strip()
        valid = {choice for choice, _label in TeamRegistration.CATEGORY_CHOICES}
        if category not in valid:
            raise forms.ValidationError(
                "Please select Female, Kids, Men's or Veteran."
            )
        return category

    def clean_pin(self):
        import random

        pin = (self.cleaned_data.get("pin") or "").strip()
        if not pin:
            # PIN fields were removed from the public form — generate one for storage.
            return f"{random.randint(0, 9999):04d}"
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
