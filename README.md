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

| Host | Cost | Always on? | Gmail auto-reply |
| --- | --- | --- | --- |
| **Fly.io + Neon** (recommended) | Free | Yes | Works |
| Render | Free | No (sleeps ~15 min) | Works |
| PythonAnywhere free | Free | Yes | **Blocked** (SMTP locked on free) |

### Option A — Fly.io (always on, free)

This is the best free option when you do **not** want cold starts.

#### A1 — Free Postgres (Neon)

1. Go to https://neon.tech and create a free project (e.g. `dashain-cup`).
2. Copy the **connection string**  
   (`postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`).

#### A2 — Install Fly and log in (on your PC)

```powershell
# Windows (PowerShell) — install flyctl, then:
fly auth login
```

Install guide: https://fly.io/docs/hands-on/install-flyctl/

#### A3 — Create the app (once)

From the project folder (after `git pull origin main`):

```powershell
fly launch --no-deploy
```

- Accept this repo’s `fly.toml`
- Choose region close to Darwin (e.g. `syd`)
- Do **not** create a Fly Postgres database (use Neon instead)

If `fly launch` renames the app, note the hostname: `https://YOUR-APP-NAME.fly.dev`

#### A4 — Set secrets

```powershell
# Generate a secret key first:
python -c "import secrets; print(secrets.token_urlsafe(50))"

fly secrets set `
  DJANGO_SECRET_KEY="paste-the-generated-key" `
  DJANGO_ALLOWED_HOSTS="YOUR-APP-NAME.fly.dev" `
  DJANGO_CSRF_TRUSTED_ORIGINS="https://YOUR-APP-NAME.fly.dev" `
  DATABASE_URL="postgresql://...neon.../neondb?sslmode=require" `
  EMAIL_HOST_USER="your-tournament-gmail@gmail.com" `
  EMAIL_HOST_PASSWORD="your-16-char-app-password" `
  ORGANISER_EMAIL="your-tournament-gmail@gmail.com" `
  DEFAULT_FROM_EMAIL="Gurkhali FC <your-tournament-gmail@gmail.com>"
```

#### A5 — Deploy

```powershell
fly deploy
```

Site URL: `https://YOUR-APP-NAME.fly.dev`

#### A6 — Create admin + test email

```powershell
fly ssh console
python manage.py createsuperuser
python manage.py check_email your-own-address@gmail.com
exit
```

Then open `/admin/` on your Fly URL.

`fly.toml` sets `min_machines_running = 1` and `auto_stop_machines = "off"` so the site stays up.

---

### Option B — Render (free, but sleeps)

This is the easiest free way to put the site on the public internet, but free
services **spin down after ~15 minutes idle** (30–60s wake-up).

#### Step A — Free Postgres database (Neon)

1. Go to https://neon.tech and create a free account.
2. Create a project (any name, e.g. `dashain-cup`).
3. Copy the **connection string** (looks like
   `postgresql://user:pass@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`).

#### Step B — Deploy the app on Render

1. Push this repo to GitHub (already done if you're reading it here).
2. Go to https://dashboard.render.com → **New** → **Web Service**.
3. Connect the `Team-Registration-Top-End-Dashain-Cup` repository, branch `main`.
4. Fill in:
   - **Runtime:** Python
   - **Build Command:** `./build.sh`
   - **Start Command:** `gunicorn dashain_cup.wsgi:application --bind 0.0.0.0:$PORT`
5. Under **Environment**, add these variables:

| Key | Value |
| --- | --- |
| `DJANGO_DEBUG` | `False` |
| `DJANGO_SECRET_KEY` | run `python -c "import secrets; print(secrets.token_urlsafe(50))"` and paste the result |
| `DJANGO_ALLOWED_HOSTS` | `your-service-name.onrender.com` (use the hostname Render shows you) |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | `https://your-service-name.onrender.com` |
| `DATABASE_URL` | the Neon connection string from Step A |
| `EMAIL_HOST_USER` | your tournament Gmail address |
| `EMAIL_HOST_PASSWORD` | your 16-character Gmail App Password |
| `ORGANISER_EMAIL` | where new-registration alerts should go |
| `DEFAULT_FROM_EMAIL` | `Gurkhali FC <your-tournament-gmail@gmail.com>` |
| `CLUB_NAME` | `Gurkhali FC` |
| `DJANGO_TIME_ZONE` | `Australia/Darwin` |

6. Click **Create Web Service** and wait for the first deploy to finish
   (usually a few minutes). Your public URL will be
   `https://your-service-name.onrender.com`.

#### Step C — Create the admin login

1. In the Render dashboard, open your service → **Shell**.
2. Run:

```bash
python manage.py createsuperuser
```

3. Visit `https://your-service-name.onrender.com/admin/` and log in.
4. Test a registration on the public site, then confirm the team appears under
   **Team registrations** and that confirmation emails arrive.

#### Step D — Confirm email works on the live server

In the Render Shell:

```bash
python manage.py check_email your-own-address@gmail.com
```

#### One-click alternative (Blueprint)

This repo includes a `render.yaml`. On Render you can also choose
**New → Blueprint**, select this repo, then fill in the `sync: false`
environment variables (`DATABASE_URL`, `DJANGO_ALLOWED_HOSTS`,
`DJANGO_CSRF_TRUSTED_ORIGINS`, and the `EMAIL_*` values) before the first
deploy.

#### Important notes (Render)

- Free Render web services **spin down after ~15 minutes of idle time**; the
  first visit after that can take 30–60 seconds to wake up. That is normal
  on the free plan.
- Do **not** use the default SQLite file on Render without a paid disk —
  it is wiped on every redeploy. Always set `DATABASE_URL` to Neon (or
  another Postgres host).
- Never commit your real `.env` file or App Password to GitHub.

---

### Option C — PythonAnywhere (always on, but free blocks Gmail)

PythonAnywhere free keeps the site online 24/7, but **outbound SMTP
(including Gmail) is blocked on free accounts**, so confirmation emails will
not send unless you upgrade to a paid plan.

Use Fly.io (Option A) if you need always-on **and** Gmail auto-replies for free.

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
