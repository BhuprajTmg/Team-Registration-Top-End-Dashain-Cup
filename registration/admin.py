import csv

from django.contrib import admin, messages
from django.http import HttpResponse
from django.utils import timezone
from django.utils.html import format_html

from .emails import send_confirmation_email, send_organiser_notification
from .models import TeamRegistration

admin.site.site_header = "Gurkhali FC — Dashain Cup Administration"
admin.site.site_title = "Gurkhali FC Admin"
admin.site.index_title = "Tournament Management"


@admin.register(TeamRegistration)
class TeamRegistrationAdmin(admin.ModelAdmin):
    list_display = (
        "team_name",
        "manager_name",
        "phone_link",
        "gmail_link",
        "player_count",
        "squad_size_display",
        "confirmation_email_sent",
        "created_at",
    )
    list_display_links = ("team_name",)
    list_filter = (
        "tournament",
        "division",
        "squad_size",
        "confirmation_email_sent",
        "organiser_notified",
        "created_at",
    )
    search_fields = ("team_name", "manager_name", "home_city", "phone", "gmail")
    date_hierarchy = "created_at"
    ordering = ("-created_at",)
    list_per_page = 50
    empty_value_display = "—"
    actions = ("export_as_csv", "resend_confirmation_email")

    readonly_fields = ("created_at", "confirmation_email_sent", "organiser_notified", "players")

    fieldsets = (
        ("Tournament", {"fields": ("tournament", "division")}),
        ("Team", {"fields": ("team_name", "manager_name", "home_city", "squad_size", "players")}),
        ("Contact", {"fields": ("phone", "gmail")}),
        ("Additional information", {"fields": ("experience", "notes")}),
        (
            "Email status",
            {
                "fields": ("confirmation_email_sent", "organiser_notified", "created_at"),
                "description": (
                    "Whether the automatic emails went out when this team registered. "
                    "Use the &quot;Resend confirmation email&quot; action on the list page to try again."
                ),
            },
        ),
    )

    @admin.display(description="Phone", ordering="phone")
    def phone_link(self, obj):
        return format_html('<a href="tel:{}">{}</a>', obj.phone, obj.phone)

    @admin.display(description="Gmail", ordering="gmail")
    def gmail_link(self, obj):
        return format_html('<a href="mailto:{}">{}</a>', obj.gmail, obj.gmail)

    @admin.display(description="Players")
    def player_count(self, obj):
        return len(obj.players or [])

    @admin.display(description="Squad size", ordering="squad_size")
    def squad_size_display(self, obj):
        return obj.get_squad_size_display() if obj.squad_size else "—"

    def changelist_view(self, request, extra_context=None):
        """Adds the summary cards shown above the list of teams."""
        queryset = TeamRegistration.objects.all()
        today = timezone.localdate()

        extra_context = extra_context or {}
        extra_context["summary"] = {
            "total": queryset.count(),
            "today": queryset.filter(created_at__date=today).count(),
            "emails_sent": queryset.filter(confirmation_email_sent=True).count(),
            "emails_pending": queryset.filter(confirmation_email_sent=False).count(),
        }
        return super().changelist_view(request, extra_context=extra_context)

    @admin.action(description="Export selected registrations to CSV")
    def export_as_csv(self, request, queryset):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="team-registrations.csv"'

        writer = csv.writer(response)
        writer.writerow(
            [
                "Registered at",
                "Tournament",
                "Division",
                "Team name",
                "Manager / Coach",
                "Home city / suburb",
                "Phone",
                "Gmail",
                "Squad size",
                "Players",
                "Previous experience",
                "Notes",
                "Confirmation email sent",
                "Organiser notified",
            ]
        )

        for team in queryset:
            players_text = "; ".join(
                f"{p.get('name')} (#{p.get('jersey')})" if p.get("jersey") else p.get("name", "")
                for p in (team.players or [])
                if p.get("name")
            )
            writer.writerow(
                [
                    timezone.localtime(team.created_at).strftime("%Y-%m-%d %H:%M"),
                    team.tournament,
                    team.division,
                    team.team_name,
                    team.manager_name,
                    team.home_city,
                    team.phone,
                    team.gmail,
                    team.get_squad_size_display() if team.squad_size else "",
                    players_text,
                    team.experience,
                    team.notes,
                    "Yes" if team.confirmation_email_sent else "No",
                    "Yes" if team.organiser_notified else "No",
                ]
            )

        return response

    @admin.action(description="Resend confirmation email to selected teams")
    def resend_confirmation_email(self, request, queryset):
        sent, failed = 0, 0

        for team in queryset:
            if send_confirmation_email(team):
                send_organiser_notification(team)
                team.confirmation_email_sent = True
                team.organiser_notified = True
                team.save(update_fields=["confirmation_email_sent", "organiser_notified"])
                sent += 1
            else:
                failed += 1

        if sent:
            self.message_user(request, f"Confirmation email resent to {sent} team(s).", messages.SUCCESS)
        if failed:
            self.message_user(
                request,
                f"Could not send email for {failed} team(s). Check that EMAIL_HOST_USER and "
                "EMAIL_HOST_PASSWORD are set in your .env file.",
                messages.ERROR,
            )
