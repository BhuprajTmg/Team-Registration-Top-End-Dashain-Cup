# Gurkhali FC — Dashain Cup 2026 Team Registration

A free, no-login team registration website for the **Gurkhali FC Dashain
Cup** (Open 7A-side football competition), themed around the club crest
colours — navy, red, and gold — with a **Django backend**.

- Public visitors just open the site and fill in the registration form —
  **no account or login required.**
- Every submission is saved in a database (viewable in the Django admin)
  and **automatically triggers two emails**, sent from your **tournament's
  own Gmail account**:
  - an **auto-reply confirmation** to the registering team's Gmail address
  - a **notification** to the organiser, so you know a new team signed up

## Project structure

```
manage.py                                Django management entry point
dashain_cup/                             Project settings, URLs, WSGI/ASGI
  settings.py                              All config — reads from .env
  urls.py                                  Root URL routing
registration/                            The registration Django app
  models.py                                TeamRegistration model
  forms.py                                 Validation (incl. Gmail-only rule)
  views.py                                 Page view + JSON register endpoint
  emails.py                                Auto-reply / organiser email logic
  admin.py                                 Django admin listing of teams
  templates/registration/
    index.html                              Landing page + registration form
    emails/                                  Confirmation & notification emails
  static/registration/
    css/style.css                           Crest-themed styling
    js/script.js                            Form validation + submission (fetch)
    img/logo.png, logo.webp                 Club crest artwork
requirements.txt
.env.example                             Copy to .env and fill in real values
```

## 1. Run it locally

```bash
python3 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env                 # then edit .env, see step 2 below

python manage.py migrate
python manage.py createsuperuser     # to view registrations in /admin/
python manage.py runserver
```

Visit `http://localhost:8000/` for the site, and `http://localhost:8000/admin/`
to see registrations (log in with the superuser you just created).

Until you complete step 2, the form still works end-to-end (submissions are
saved to the database and you'll see a success message) — emails are just
printed to the console instead of actually being sent, so you can develop
and test everything without Gmail credentials.

## 2. Connect your tournament Gmail account (for auto-reply + notifications)

Emails are sent via standard Gmail SMTP, using an **App Password** — no
paid email service required.

1. Sign in to Google as the **tournament's Gmail account** (e.g.
   `gurkhalifc.dashaincup@gmail.com`) — this is the address confirmation
   emails will be sent *from*.
2. Turn on **2-Step Verification** if it isn't already on:
   https://myaccount.google.com/security
3. Generate an **App Password** for "Mail":
   https://myaccount.google.com/apppasswords
   (This page only appears once 2-Step Verification is enabled.) Copy the
   16-character password it gives you.
4. Open `.env` and fill in:

   ```env
   EMAIL_HOST_USER=gurkhalifc.dashaincup@gmail.com
   EMAIL_HOST_PASSWORD=xxxxxxxxxxxxxxxx   # the 16-char App Password, not your normal Gmail password
   ORGANISER_EMAIL=gurkhalifc.dashaincup@gmail.com   # or a different address for the committee
   DEFAULT_FROM_EMAIL=Gurkhali FC <gurkhalifc.dashaincup@gmail.com>
   ```

5. Restart the server (`python manage.py runserver`). New registrations
   will now:
   - get an **auto-reply confirmation email** at the Gmail address they
     registered with, and
   - send a **notification email to `ORGANISER_EMAIL`**.

6. Confirm it actually works before opening registrations to teams:

   ```bash
   python manage.py check_email your-own-address@gmail.com
   ```

   This prints the email configuration in use and sends one real test
   email, reporting Gmail's exact error if something is wrong.

Gmail's free sending limit is ~500 emails/day (2,000/day on Google
Workspace), which is comfortably enough for tournament registrations.

### Emails aren't arriving?

Registrations are **always saved first**, so a team's entry is never lost
because of an email problem — you'll still see them in the admin, and can
use the *Resend confirmation email* action there once the setup is fixed.

Run `python manage.py check_email <your-address@gmail.com>` first; it
reports Gmail's exact error. The usual causes:

| Symptom | Cause |
| --- | --- |
| `535 Username and Password not accepted` | `EMAIL_HOST_PASSWORD` is your normal Gmail password, not a 16-character App Password |
| App Passwords page unavailable | 2-Step Verification isn't enabled on the account |
| Emails print to the terminal instead of sending | `EMAIL_HOST_USER`/`EMAIL_HOST_PASSWORD` are blank, so the console backend is used |
| Timeout / connection refused | Port 587 is blocked by your network or host — try `EMAIL_PORT=465` with `EMAIL_USE_TLS=False` and `EMAIL_USE_SSL=True` |
| Confirmation arrived but organiser copy didn't | `ORGANISER_EMAIL` is unset or pointing elsewhere |

The server log always records the real reason a send failed, and the
registration form itself never claims an email was sent when it wasn't.

## 3. View & manage registrations (admin panel)

Every submission is stored in the database and visible in the admin at
`http://localhost:8000/admin/`.

> **Where are my registered teams?** The admin *home* page only lists your
> models — it never lists records, and the "Recent actions" box only logs
> edits **you** make inside the admin, so it stays empty even when teams
> have registered. Click **Team registrations** to see the actual list of
> teams.

The **Team registrations** page gives you:

- **Summary cards** — teams registered, registered today, confirmation
  emails sent, and emails not sent.
- **Sortable table** — team name, manager/coach, home city, phone (click
  to call), Gmail (click to email), squad size, whether the confirmation
  email went out, and registration date/time.
- **Search** — by team name, manager, city, phone, or Gmail.
- **Filters** — tournament, division, squad size, email status, and
  registration date, plus a year/month/day drill-down.
- **Export selected registrations to CSV** — bulk action for spreadsheets.
- **Resend confirmation email to selected teams** — bulk action to retry
  emails that failed (e.g. registrations taken before you configured
  Gmail).
- **Grouped detail page** — each team's record is organised into
  Tournament / Team / Contact / Additional information / Email status.

If you ever want to double-check the data outside the admin:

```bash
python manage.py shell -c "from registration.models import TeamRegistration; print(TeamRegistration.objects.count())"
```

And to verify the whole registration pipeline (saving, validation, emails,
admin listing) is working:

```bash
python manage.py test
```

## 4. Deploying

This is a standard Django app — deploy it anywhere that runs Python
(Render, Railway, PythonAnywhere, Fly.io, a VPS, etc.). A quick checklist:

- Set real environment variables (`DJANGO_SECRET_KEY`, `DJANGO_DEBUG=False`,
  `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS`, the `EMAIL_*`
  variables, `SITE_URL`) — see `.env.example` for the full list.
- Switch to a production database if you expect heavy traffic (SQLite,
  used by default, is fine for a single tournament's registrations).
- Run `python manage.py collectstatic` — static files are served via
  [WhiteNoise](https://whitenoise.readthedocs.io/), already wired up in
  `settings.py`, so no separate static file host/CDN is required.
- Run the app with a production server, e.g.
  `gunicorn dashain_cup.wsgi:application`.

## 5. Customising

- **Tournament name / division**: edit `TOURNAMENT_TITLE`, `TOURNAMENT_YEAR`,
  and `DIVISION_NAME` at the top of `registration/views.py`.
- **Colours**: all theme colours are CSS variables at the top of
  `registration/static/registration/css/style.css` (`--navy`, `--red`,
  `--gold`, `--cream`, etc.).
- **Logo**: replace `registration/static/registration/img/logo.png` /
  `.webp` with your own crest artwork (keep the filenames, or update the
  references in `registration/templates/registration/index.html`).
- **Form fields**: add/remove fields in `registration/models.py` (create a
  migration with `python manage.py makemigrations`), `registration/forms.py`,
  the form markup in `templates/registration/index.html`, and the payload
  built in `static/registration/js/script.js`.
- **Email content**: edit the templates in
  `registration/templates/registration/emails/`.

## Data & privacy notes

- Registration data lives in your own database — nothing is sent to any
  third party other than the emails you configure.
- The `/api/register/` endpoint only accepts the specific JSON shape the
  form sends and is protected by Django's built-in CSRF protection.
