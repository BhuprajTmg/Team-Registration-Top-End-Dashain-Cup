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


def parse_image_payload(
    raw,
    *,
    required: bool = False,
    field_label: str = "Image",
    filename_prefix: str = "image",
    max_bytes: int = MAX_LOGO_BYTES,
) -> tuple[bytes | None, str, str]:
    """Accept a data-URL string and return (bytes, content_type, filename)."""
    if raw in (None, "") or (isinstance(raw, str) and not raw.strip()):
        if required:
            raise forms.ValidationError(f"Upload a {field_label.lower()}. This field is required.")
        return None, "", ""

    if not isinstance(raw, str):
        raise forms.ValidationError(f"{field_label} must be an image file.")

    raw = raw.strip()

    match = _DATA_URL_RE.match(raw)
    max_mb = max(1, max_bytes // (1024 * 1024))
    if not match:
        raise forms.ValidationError(
            f"{field_label} must be a JPG, PNG, WEBP, or GIF image under {max_mb} MB."
        )

    content_type = normalize_content_type(match.group(1))
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise forms.ValidationError(
            f"{field_label} must be a JPG, PNG, WEBP, or GIF image."
        )

    try:
        data = base64.b64decode(match.group(2), validate=False)
    except Exception as exc:
        raise forms.ValidationError(f"Could not read the {field_label.lower()} file.") from exc

    if not data:
        raise forms.ValidationError(f"{field_label} file was empty.")
    if len(data) > max_bytes:
        raise forms.ValidationError(f"{field_label} must be {max_mb} MB or smaller.")

    ext = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
    }.get(content_type, "img")
    return data, content_type, f"{filename_prefix}.{ext}"


def parse_logo_payload(raw, *, required: bool = False) -> tuple[bytes | None, str, str]:
    return parse_image_payload(
        raw,
        required=required,
        field_label="Team logo",
        filename_prefix="team-logo",
    )


def parse_receipt_payload(raw, *, required: bool = True) -> tuple[bytes | None, str, str]:
    return parse_image_payload(
        raw,
        required=required,
        field_label="Payment screenshot",
        filename_prefix="payment-receipt",
        max_bytes=2 * 1024 * 1024,
    )
