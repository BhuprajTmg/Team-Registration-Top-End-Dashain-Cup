#!/usr/bin/env bash
# Build script used by Render (and similar hosts) on every deploy.
set -o errexit

chmod +x ./build.sh 2>/dev/null || true
pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate --no-input
