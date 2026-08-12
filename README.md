# Gurkhali FC — Dashain Cup 2026 Team Registration

A free, no-login team registration site for the **Gurkhali FC Dashain Cup**
(Open 7A-side football competition), themed around the club crest colours —
navy, red, and gold.

- Public visitors just open the site and fill in the registration form —
  **no account or login required.**
- Every submission is saved to a Google Sheet and triggers two emails
  (sent from your **tournament's own Gmail account**):
  - a **confirmation email to the registering team's Gmail address**
  - a **notification email to the organiser** so you know a new team signed up

No paid services, servers, or databases needed — it's a static site plus a
small Google Apps Script "backend" that runs for free on Google's
infrastructure.

## Project structure

```
index.html               Landing page + registration form (modal)
assets/css/style.css      Crest-themed styling
assets/js/script.js       Form validation + submission logic (edit CONFIG here)
assets/img/logo.png/.webp Club crest artwork
backend/Code.gs           Google Apps Script: saves to Sheet + sends emails
```

## 1. Preview locally

No build step is required — it's plain HTML/CSS/JS. From the project root:

```bash
python3 -m http.server 8080
# then open http://localhost:8080 in your browser
```

The form will validate and show a friendly "not configured yet" message
until you complete step 2 below.

## 2. Connect the tournament Gmail account (so teams get notified)

The email-sending "backend" is a Google Apps Script, deployed under your
**tournament's Gmail account**. That's the account emails will be sent
*from*, and it also owns the Google Sheet that stores every registration.

1. Sign in to Google as the **tournament Gmail account** (e.g.
   `gurkhalifc.dashaincup@gmail.com`).
2. Create a new Google Sheet — name it anything, e.g. `Dashain Cup 2026 Teams`.
3. In the Sheet, go to **Extensions → Apps Script**.
4. Delete the placeholder code and paste in the full contents of
   [`backend/Code.gs`](backend/Code.gs).
5. At the top of the script, edit the `CONFIG` block:
   - `ORGANISER_EMAIL`: the email address that should receive a copy of
     every new registration (can be the same Gmail account, or a different
     one, e.g. a committee member).
   - `SHARED_SECRET` (optional): set any random string here to lock the
     endpoint down to your form only; leave blank if you don't need this.
6. Click **Deploy → New deployment**.
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (this is what lets registrants submit the
     form without logging in — it only exposes this one script action, not
     your Sheet or inbox).
7. Click **Deploy**, then approve the Google permission prompts (Sheets +
   Gmail access) — approve these while logged in as the tournament Gmail
   account.
8. Copy the **Web app URL** shown after deployment (it looks like
   `https://script.google.com/macros/s/AKfycb.../exec`).
9. Open [`assets/js/script.js`](assets/js/script.js) and paste that URL into:

   ```js
   const CONFIG = {
     SUBMIT_URL: "https://script.google.com/macros/s/AKfycb.../exec",
     ...
   };
   ```

10. If you set a `SHARED_SECRET` in step 5, also add `token:
    "<your-secret>"` to the `payload` object built in `script.js`.

Whenever you edit `Code.gs` later, use **Deploy → Manage deployments →
Edit → New version** so the live URL picks up your changes.

## 3. Host the site (no login required for users)

Any static hosting works. Two easy free options:

**GitHub Pages**
1. Push this repo to GitHub (already done if you're reading this from the
   repo).
2. Go to **Settings → Pages**, set the source to the `main` branch, root
   folder.
3. Your site will be live at `https://<username>.github.io/<repo>/`.

**Netlify / Vercel**
1. Import the repository.
2. No build command needed — root directory contains `index.html` directly.
3. Deploy — you'll get a public URL instantly.

Because the whole site is static HTML/CSS/JS with no user accounts, none
of these hosts require registrants to log in to anything.

## 4. Customising

- **Tournament name / division**: edit the `CONFIG.TOURNAMENT` /
  `CONFIG.DIVISION` values in `assets/js/script.js`, and the matching
  "fixed value" text in the form section of `index.html`.
- **Colours**: all theme colours are CSS variables at the top of
  `assets/css/style.css` (`--navy`, `--red`, `--gold`, `--cream`, etc.) —
  change them there to re-theme the whole site.
- **Logo**: replace `assets/img/logo.png` and `assets/img/logo.webp` with
  your own crest artwork (keep the same filenames, or update the
  references in `index.html`).
- **Form fields**: add/remove fields inside the `<form id="registrationForm">`
  in `index.html`, then update the `payload` object in
  `assets/js/script.js` and the corresponding row/columns in
  `backend/Code.gs` (`appendToSheet`, email bodies) to match.

## Data & privacy notes

- Registration data lives only in the Google Sheet you created — this
  project doesn't send data anywhere else.
- The Apps Script web app endpoint only accepts the specific JSON shape
  produced by the form; add the optional `SHARED_SECRET` if you want an
  extra layer of protection against spam submissions.
