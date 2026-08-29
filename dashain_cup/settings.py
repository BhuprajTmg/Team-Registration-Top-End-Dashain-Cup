"""
Django settings for the Gurkhali FC — Dashain Cup team registration site.

Configuration that differs between environments (secrets, Gmail SMTP
credentials, allowed hosts, etc.) is read from environment variables /
a local `.env` file — see `.env.example` and README.md for the full list
and how to obtain a Gmail "app password" for sending auto-reply emails.
"""

import os
import sys
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

RUNNING_TESTS = "test" in sys.argv

load_dotenv(BASE_DIR / ".env")


def env_str(name, default=""):
    """Reads an environment variable, treating a blank value as unset.

    `.env.example` invites blank values (e.g. "leave DEFAULT_FROM_EMAIL blank
    to use the default"), so an empty string must fall back to the default
    rather than being taken literally.
    """
    value = os.environ.get(name)
    if value is None or not value.strip():
        return default
    return value.strip()


def env_bool(name, default=False):
    value = env_str(name)
    if not value:
        return default
    return value.lower() in ("1", "true", "yes", "on")


def env_int(name, default):
    value = env_str(name)
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        raise ImproperlyConfigured(f"{name} must be a whole number, got {value!r}.")


def env_list(name, default=""):
    raw = env_str(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = env_str(
    "DJANGO_SECRET_KEY",
    "django-insecure-dev-only-change-me-in-production",
)

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = env_bool("DJANGO_DEBUG", default=True)

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", "")

# On HTTPS hosts (Fly, Render, etc.) browsers send an Origin header. Django 4+
# requires those origins to be listed or CSRF POSTs to /api/* will fail with
# a 403 — which the registration form shows as a generic "Registration Failed".
if not CSRF_TRUSTED_ORIGINS:
    CSRF_TRUSTED_ORIGINS = [
        f"https://{host}"
        for host in ALLOWED_HOSTS
        if host and host not in ("*", "localhost", "127.0.0.1") and not host.startswith(".")
    ]

# Return JSON for API CSRF failures instead of an HTML 403 page.
CSRF_FAILURE_VIEW = "dashain_cup.csrf.csrf_failure"


# Application definition

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "registration",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "dashain_cup.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "dashain_cup.wsgi.application"


# Local default is SQLite. On Render / Railway / similar hosts, set DATABASE_URL
# to a Postgres connection string (Render provides this automatically when you
# attach a Postgres database).

_database_url = env_str("DATABASE_URL", f"sqlite:///{BASE_DIR / 'db.sqlite3'}")
DATABASES = {
    "default": dj_database_url.parse(
        _database_url,
        conn_max_age=600,
        ssl_require=_database_url.startswith("postgres"),
    )
}


# Password validation
# https://docs.djangoproject.com/en/6.1/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# Internationalization
# https://docs.djangoproject.com/en/6.1/topics/i18n/

LANGUAGE_CODE = "en-us"

# Top End of Australia (Darwin) is the tournament's home timezone.
TIME_ZONE = env_str("DJANGO_TIME_ZONE", "Australia/Darwin")

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/6.1/howto/static-files/

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        # Hashed filenames give browsers cache-busting URLs, but they require
        # `collectstatic` to have run first. The test suite doesn't run it, so
        # fall back to plain compressed storage there.
        "BACKEND": (
            "whitenoise.storage.CompressedStaticFilesStorage"
            if RUNNING_TESTS
            else "whitenoise.storage.CompressedManifestStaticFilesStorage"
        ),
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# ---------------------------------------------------------------------------
# Email — auto-reply / organiser notifications via the tournament's Gmail
# account. See README.md for how to generate a Gmail "app password".
# ---------------------------------------------------------------------------

CLUB_NAME = env_str("CLUB_NAME", "Gurkhali FC")

EMAIL_HOST_USER = env_str("EMAIL_HOST_USER")
# Gmail shows App Passwords in "abcd efgh ijkl mnop" form; the spaces are
# display-only and must be stripped before authenticating.
EMAIL_HOST_PASSWORD = env_str("EMAIL_HOST_PASSWORD").replace(" ", "")
ORGANISER_EMAIL = env_str("ORGANISER_EMAIL", EMAIL_HOST_USER)

if EMAIL_HOST_USER and EMAIL_HOST_PASSWORD:
    EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
else:
    # No Gmail credentials configured yet — print emails to the console
    # instead of failing, so the site still works end-to-end locally.
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

EMAIL_HOST = env_str("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = env_int("EMAIL_PORT", 587)
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", default=True)
# Alternative to TLS for hosts that only allow Gmail's port 465.
EMAIL_USE_SSL = env_bool("EMAIL_USE_SSL", default=False)

if EMAIL_USE_TLS and EMAIL_USE_SSL:
    raise ImproperlyConfigured(
        "EMAIL_USE_TLS and EMAIL_USE_SSL are mutually exclusive — enable only one "
        "(TLS with port 587, or SSL with port 465)."
    )

# Without a timeout, an unreachable/blocked SMTP host would hang the
# registration request indefinitely.
EMAIL_TIMEOUT = env_int("EMAIL_TIMEOUT", 20)

DEFAULT_FROM_EMAIL = env_str(
    "DEFAULT_FROM_EMAIL",
    f"{CLUB_NAME} <{EMAIL_HOST_USER}>" if EMAIL_HOST_USER else f"{CLUB_NAME} <no-reply@example.com>",
)


# ---------------------------------------------------------------------------
# Logging — make sure email failures are always visible in the server output
# rather than disappearing silently.
# ---------------------------------------------------------------------------

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "simple": {"format": "[{levelname}] {asctime} {name}: {message}", "style": "{"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "simple"},
    },
    "loggers": {
        "django": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "registration": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}


# ---------------------------------------------------------------------------
# Production hardening (only when DJANGO_DEBUG=False)
# ---------------------------------------------------------------------------

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", default=True)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    CSRF_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SAMESITE = "Lax"
    # Render / Railway / Fly terminate TLS at the load balancer.
    SECURE_HSTS_SECONDS = env_int("SECURE_HSTS_SECONDS", 31536000)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    # Require a real secret key in production — never ship the insecure default.
    if SECRET_KEY.startswith("django-insecure-"):
        raise ImproperlyConfigured(
            "Set DJANGO_SECRET_KEY to a long random value before deploying with "
            "DJANGO_DEBUG=False. Generate one with: "
            "python -c \"import secrets; print(secrets.token_urlsafe(50))\""
        )
    if not ALLOWED_HOSTS:
        raise ImproperlyConfigured(
            "Set DJANGO_ALLOWED_HOSTS to your live domain "
            "(e.g. your-app.onrender.com) before deploying with DJANGO_DEBUG=False."
        )
    if not CSRF_TRUSTED_ORIGINS:
        raise ImproperlyConfigured(
            "Set DJANGO_CSRF_TRUSTED_ORIGINS to your https origin "
            "(e.g. https://your-app.fly.dev) or set DJANGO_ALLOWED_HOSTS so it can "
            "be derived automatically."
        )
