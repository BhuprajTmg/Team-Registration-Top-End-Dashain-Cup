"""Helpers for required team logo uploads (stored in Postgres as binary)."""

from __future__ import annotations

import base64
import re

from django import forms

MAX_LOGO_BYTES = 1024 * 1024  # 1 MB
ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
}

_DATA_URL_RE = re.compile(
    r"^data:(image/(?:jpeg|jpg|png|webp|gif));base64,(.+)$",
    re.IGNORECASE | re.DOTALL,
)


def normalize_content_type(content_type: str) -> str:
    ct = (content_type or "").strip().lower()
    if ct == "image/jpg":
        return "image/jpeg"
    return ct


def parse_logo_payload(raw, *, required: bool = False) -> tuple[bytes | None, str, str]:
    """
    Accept a data-URL string from the JSON API and return (bytes, content_type, filename).

    Empty / missing values return (None, "", "") unless required=True.
    """
    if raw in (None, "") or (isinstance(raw, str) and not raw.strip()):
        if required:
            raise forms.ValidationError("Upload a team logo. This field is required.")
        return None, "", ""

    if not isinstance(raw, str):
        raise forms.ValidationError("Team logo must be an image file.")

    raw = raw.strip()

    match = _DATA_URL_RE.match(raw)
    if not match:
        raise forms.ValidationError(
            "Team logo must be a JPG, PNG, WEBP, or GIF image under 1 MB."
        )

    content_type = normalize_content_type(match.group(1))
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise forms.ValidationError(
            "Team logo must be a JPG, PNG, WEBP, or GIF image."
        )

    try:
        data = base64.b64decode(match.group(2), validate=False)
    except Exception as exc:
        raise forms.ValidationError("Could not read the team logo file.") from exc

    if not data:
        raise forms.ValidationError("Team logo file was empty.")
    if len(data) > MAX_LOGO_BYTES:
        raise forms.ValidationError("Team logo must be 1 MB or smaller.")

    ext = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
    }.get(content_type, "img")
    return data, content_type, f"team-logo.{ext}"
