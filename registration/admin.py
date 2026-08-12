from django.contrib import admin

from .models import TeamRegistration


@admin.register(TeamRegistration)
class TeamRegistrationAdmin(admin.ModelAdmin):
    list_display = (
        "team_name",
        "manager_name",
        "home_city",
        "phone",
        "gmail",
        "tournament",
        "confirmation_email_sent",
        "created_at",
    )
    list_filter = ("tournament", "division", "squad_size", "confirmation_email_sent")
    search_fields = ("team_name", "manager_name", "home_city", "phone", "gmail")
    readonly_fields = (
        "created_at",
        "confirmation_email_sent",
        "organiser_notified",
    )
    ordering = ("-created_at",)
