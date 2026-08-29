"""CSRF failure handler that returns JSON for API endpoints."""

from django.http import HttpResponseForbidden, JsonResponse


def csrf_failure(request, reason=""):
    if request.path.startswith("/api/"):
        return JsonResponse(
            {
                "ok": False,
                "status": "error",
                "message": (
                    "Security check failed. Please refresh the page and try again. "
                    "If this keeps happening, confirm DJANGO_CSRF_TRUSTED_ORIGINS "
                    "includes https://your-app.fly.dev."
                ),
                "reason": str(reason),
            },
            status=403,
        )
    return HttpResponseForbidden(
        "CSRF verification failed. Please go back, refresh the page, and try again."
    )
