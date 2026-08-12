from django import forms

from .models import TeamRegistration


class TeamRegistrationForm(forms.ModelForm):
    agree = forms.BooleanField(
        required=True,
        error_messages={
            "required": "Please confirm the details are accurate and accept the tournament rules."
        },
    )

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
        return self.cleaned_data["home_city"].strip()

    def clean_phone(self):
        return self.cleaned_data["phone"].strip()
