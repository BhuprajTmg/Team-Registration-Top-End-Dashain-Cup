# Production image for Fly.io (and similar always-on hosts).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x ./build.sh \
    && DJANGO_SECRET_KEY=build-only \
       DJANGO_DEBUG=False \
       DJANGO_ALLOWED_HOSTS='*' \
       python manage.py collectstatic --no-input

EXPOSE 8000

CMD ["gunicorn", "dashain_cup.wsgi:application", "--bind", "0.0.0.0:8000"]
