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
        "logo_thumb",
        "team_name",
        "category",
        "manager_name",
        "phone_link",
        "gmail_link",
        "player_count",
        "squad_size_display",
        "payment_status",
        "confirmation_email_sent",
        "created_at",
    )
    list_display_links = ("team_name",)
    list_filter = (
        "category",
        "tournament",
        "division",
        "squad_size",
        "confirmation_email_sent",
        "organiser_notified",
        "payment_received_at",
        "created_at",
    )
    search_fields = ("team_name", "manager_name", "home_city", "phone", "gmail")
    date_hierarchy = "created_at"
    ordering = ("-created_at",)
    list_per_page = 50
    empty_value_display = "—"
    actions = ("export_as_csv", "resend_confirmation_email")

    readonly_fields = (
        "created_at",
        "confirmation_email_sent",
        "organiser_notified",
        "players",
        "logo_preview",
        "logo_filename",
        "logo_content_type",
        "receipt_preview",
        "payment_receipt_filename",
        "payment_received_at",
    )

    fieldsets = (
        ("Tournament", {"fields": ("tournament", "division", "category")}),
        (
            "Team",
            {
                "fields": (
                    "team_name",
                    "manager_name",
                    "home_city",
                    "squad_size",
                    "logo_preview",
                    "logo_filename",
                    "logo_content_type",
                    "players",
                )
            },
        ),
        ("Contact", {"fields": ("phone", "gmail")}),
        (
            "PayID payment",
            {
                "fields": (
                    "receipt_preview",
                    "payment_receipt_filename",
                    "payment_received_at",
                ),
                "description": "Bank-statement screenshot uploaded after the team paid via PayID.",
            },
        ),
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

    def _logo_url(self, obj):
        return f"/api/teams/{obj.pk}/logo/"

    @admin.display(description="Logo")
    def logo_thumb(self, obj):
        if not obj.has_logo:
            return "—"
        return format_html(
            '<a href="{0}" target="_blank" rel="noopener">'
            '<img src="{0}" alt="Logo for {1}" '
            'style="height:40px;width:40px;object-fit:cover;border-radius:50%;'
            'border:1px solid #ccc;background:#fff;" />'
            "</a>",
            self._logo_url(obj),
            obj.team_name,
        )

    @admin.display(description="Team logo")
    def logo_preview(self, obj):
        if not obj.has_logo:
            return format_html("<em>{}</em>", "No logo uploaded")
        filename = obj.logo_filename or "team-logo"
        return format_html(
            '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">'
            '<a href="{0}" target="_blank" rel="noopener">'
            '<img src="{0}" alt="Team logo" '
            'style="max-height:120px;max-width:180px;border-radius:10px;'
            'background:#111;padding:6px;border:1px solid #444;" />'
            "</a>"
            "<div>"
            "<div><strong>{1}</strong></div>"
            '<div style="margin-top:6px;">'
            '<a href="{0}" target="_blank" rel="noopener">Open full size</a>'
            " &nbsp;|&nbsp; "
            '<a href="{0}" download="{1}">Download</a>'
            "</div>"
            "</div>"
            "</div>",
            self._logo_url(obj),
            filename,
        )

    def _receipt_url(self, obj):
        return f"/api/teams/{obj.pk}/receipt/"

    @admin.display(description="Payment")
    def payment_status(self, obj):
        if obj.has_payment_receipt:
            when = ""
            if obj.payment_received_at:
                when = timezone.localtime(obj.payment_received_at).strftime("%d %b %Y")
            return format_html(
                '<a href="{}" target="_blank" rel="noopener">Receipt on file{}</a>',
                self._receipt_url(obj),
                f" ({when})" if when else "",
            )
            return format_html('<span style="color:#b42318;">{}</span>', "Awaiting screenshot")

    @admin.display(description="Payment screenshot")
    def receipt_preview(self, obj):
        if not obj.has_payment_receipt:
            return format_html("{}", "No PayID screenshot uploaded yet")
        filename = obj.payment_receipt_filename or "payment-receipt"
        received = ""
        if obj.payment_received_at:
            received = timezone.localtime(obj.payment_received_at).strftime("%Y-%m-%d %H:%M")
        return format_html(
            '<div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;">'
            '<a href="{0}" target="_blank" rel="noopener">'
            '<img src="{0}" alt="Payment screenshot" '
            'style="max-height:220px;max-width:280px;border-radius:10px;'
            'background:#111;padding:6px;border:1px solid #444;" />'
            "</a>"
            "<div>"
            "<div><strong>{1}</strong></div>"
            "<div>Received: {2}</div>"
            '<div style="margin-top:6px;">'
            '<a href="{0}" target="_blank" rel="noopener">Open full size</a>'
            " &nbsp;|&nbsp; "
            '<a href="{0}" download="{1}">Download</a>'
            "</div>"
            "</div>"
            "</div>",
            self._receipt_url(obj),
            filename,
            received or "—",
        )

    def changelist_view(self, request, extra_context=None):
        """Adds the summary cards shown above the list of teams."""
        queryset = TeamRegistration.objects.all()
        today = timezone.localdate()

        extra_context = extra_context or {}
        extra_context["summary"] = {
            "total": queryset.count(),
            "female": queryset.filter(category=TeamRegistration.CATEGORY_FEMALE).count(),
            "kids": queryset.filter(category=TeamRegistration.CATEGORY_KIDS).count(),
            "mens": queryset.filter(category=TeamRegistration.CATEGORY_MENS).count(),
            "veteran": queryset.filter(category=TeamRegistration.CATEGORY_VETERAN).count(),
            "today": queryset.filter(created_at__date=today).count(),
            "emails_sent": queryset.filter(confirmation_email_sent=True).count(),
            "emails_pending": queryset.filter(confirmation_email_sent=False).count(),
            "payments_received": queryset.filter(payment_received_at__isnull=False).count(),
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
                "Team category",
                "Team name",
                "Manager / Coach",
                "Home city / suburb",
                "Phone",
                "Gmail",
                "Squad size",
                "Players",
                "Previous experience",
                "Notes",
                "Payment screenshot",
                "Payment received at",
                "Confirmation email sent",
                "Organiser notified",
            ]
        )

        for team in queryset:
            players_text = "; ".join(
                (
                    (
                        f"{p.get('name')} ({p.get('phone')})"
                        if p.get("phone")
                        else p.get("name", "")
                    )
                    + (f" <{p.get('gmail')}>" if p.get("gmail") else "")
                    + (" [Premier]" if p.get("mpl") else "")
                )
                for p in (team.players or [])
                if p.get("name")
            )
            writer.writerow(
                [
                    timezone.localtime(team.created_at).strftime("%Y-%m-%d %H:%M"),
                    team.tournament,
                    team.division,
                    team.get_category_display(),
                    team.team_name,
                    team.manager_name,
                    team.home_city,
                    team.phone,
                    team.gmail,
                    team.get_squad_size_display() if team.squad_size else "",
                    players_text,
                    team.experience,
                    team.notes,
                    "Yes" if team.has_payment_receipt else "No",
                    timezone.localtime(team.payment_received_at).strftime("%Y-%m-%d %H:%M")
                    if team.payment_received_at
                    else "",
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
