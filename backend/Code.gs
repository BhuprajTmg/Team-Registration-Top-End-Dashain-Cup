/**
 * Gurkhali FC — Dashain Cup 2026 Team Registration
 * Google Apps Script backend
 *
 * WHAT THIS DOES
 * ----------------------------------------------------------------------
 * 1. Receives the registration form submission from index.html (no login
 *    required for the person registering — this script just needs to be
 *    deployed once by the tournament organiser).
 * 2. Appends every submission as a new row in a Google Sheet, so you have
 *    a running list of registered teams.
 * 3. Sends a confirmation email to the TEAM's Gmail address, and a
 *    notification email to the ORGANISER_EMAIL — both sent FROM the Gmail
 *    account that this script is deployed under (see setup below), so
 *    make sure that's the tournament's Gmail account.
 *
 * ONE-TIME SETUP
 * ----------------------------------------------------------------------
 * 1. Log in to Google with the TOURNAMENT'S Gmail account (the one that
 *    should appear as the sender of confirmation emails).
 * 2. Create a new Google Sheet (any name, e.g. "Dashain Cup 2026 Teams").
 * 3. In the sheet, open Extensions -> Apps Script.
 * 4. Delete the default code in Code.gs and paste in this whole file.
 * 5. Update the CONFIG block right below with your organiser email and,
 *    optionally, a shared secret token.
 * 6. Click Deploy -> New deployment.
 *      - Select type: "Web app"
 *      - Description: "Dashain Cup registration endpoint"
 *      - Execute as: "Me"
 *      - Who has access: "Anyone" (this is what allows registrants to
 *        submit the form WITHOUT logging in — it does not give access to
 *        your Sheet or Gmail, only to this specific script action).
 * 7. Click Deploy, authorise the requested permissions (Sheets + Gmail)
 *    with the tournament Gmail account, then copy the "Web app URL".
 * 8. Paste that URL into assets/js/script.js as CONFIG.SUBMIT_URL.
 * 9. Re-run "Deploy -> Manage deployments -> Edit -> New version" any time
 *    you change this script, otherwise the live URL keeps running the old
 *    code.
 */

// ======================= CONFIG — edit these =======================

var CONFIG = {
  // Email that gets a copy of every new registration.
  ORGANISER_EMAIL: "your-tournament-gmail@gmail.com",

  // Optional shared secret. If set, the front-end must send the same
  // value as payload.token, or submissions are rejected. Leave blank to
  // disable this check (fine for a public, no-login registration form).
  SHARED_SECRET: "",

  // Name of the sheet tab where responses are stored.
  SHEET_NAME: "Registrations",

  TOURNAMENT_NAME: "Dashain Cup 2026",
  CLUB_NAME: "Gurkhali FC"
};

// ======================= Web app entry point =======================

function doPost(e) {
  var result = { status: "ok" };

  try {
    var data = parseRequest(e);

    if (CONFIG.SHARED_SECRET && data.token !== CONFIG.SHARED_SECRET) {
      return jsonResponse({ status: "error", message: "Invalid request token." });
    }

    validateSubmission(data);

    appendToSheet(data);
    sendTeamConfirmationEmail(data);
    sendOrganiserNotificationEmail(data);
  } catch (err) {
    result = { status: "error", message: err && err.message ? err.message : String(err) };
  }

  return jsonResponse(result);
}

// Simple GET handler so visiting the web app URL directly shows a
// friendly message instead of an error page.
function doGet(e) {
  return ContentService.createTextOutput(
    "Gurkhali FC registration endpoint is live. Submit via POST from the registration form."
  ).setMimeType(ContentService.MimeType.TEXT);
}

// ======================= Helpers =======================

function parseRequest(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error("Missing request body.");
  }
  var data = JSON.parse(e.postData.contents);
  return data;
}

function validateSubmission(data) {
  var required = ["teamName", "managerName", "homeCity", "phone", "gmail"];
  for (var i = 0; i < required.length; i++) {
    var key = required[i];
    if (!data[key] || String(data[key]).trim() === "") {
      throw new Error("Missing required field: " + key);
    }
  }
  if (!/^[^@\s]+@gmail\.com$/i.test(data.gmail)) {
    throw new Error("Team email must be a valid Gmail address.");
  }
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    sheet.appendRow([
      "Timestamp",
      "Tournament",
      "Division",
      "Team Name",
      "Manager / Coach",
      "Home City / Suburb",
      "Phone",
      "Gmail",
      "Squad Size",
      "Previous Experience",
      "Notes"
    ]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function appendToSheet(data) {
  var sheet = getSheet();
  sheet.appendRow([
    new Date(),
    data.tournament || CONFIG.TOURNAMENT_NAME,
    data.division || "",
    data.teamName,
    data.managerName,
    data.homeCity,
    data.phone,
    data.gmail,
    data.squadSize || "",
    data.experience || "",
    data.notes || ""
  ]);
}

function sendTeamConfirmationEmail(data) {
  var subject = CONFIG.CLUB_NAME + " — " + (data.tournament || CONFIG.TOURNAMENT_NAME) + " Registration Received";

  var body =
    "Kia ora " + data.managerName + ",\n\n" +
    "Thanks for registering \"" + data.teamName + "\" for the " + (data.tournament || CONFIG.TOURNAMENT_NAME) +
    " (" + (data.division || "Open division") + ").\n\n" +
    "Here's what we received:\n" +
    "  Team Name: " + data.teamName + "\n" +
    "  Manager / Coach: " + data.managerName + "\n" +
    "  Home City / Suburb: " + data.homeCity + "\n" +
    "  Phone: " + data.phone + "\n" +
    "  Squad Size: " + (data.squadSize || "Not specified") + "\n" +
    "  Previous Experience: " + (data.experience || "N/A") + "\n" +
    "  Notes: " + (data.notes || "N/A") + "\n\n" +
    "We'll be in touch with fixtures and further details closer to the tournament.\n\n" +
    "Himalayan Hearts, Top End Spirits.\n" +
    CONFIG.CLUB_NAME;

  GmailApp.sendEmail(data.gmail, subject, body, {
    name: CONFIG.CLUB_NAME + " — " + CONFIG.TOURNAMENT_NAME
  });
}

function sendOrganiserNotificationEmail(data) {
  if (!CONFIG.ORGANISER_EMAIL) return;

  var subject = "New team registered: " + data.teamName + " (" + (data.tournament || CONFIG.TOURNAMENT_NAME) + ")";

  var body =
    "A new team just registered.\n\n" +
    "  Team Name: " + data.teamName + "\n" +
    "  Manager / Coach: " + data.managerName + "\n" +
    "  Home City / Suburb: " + data.homeCity + "\n" +
    "  Phone: " + data.phone + "\n" +
    "  Gmail: " + data.gmail + "\n" +
    "  Squad Size: " + (data.squadSize || "Not specified") + "\n" +
    "  Previous Experience: " + (data.experience || "N/A") + "\n" +
    "  Notes: " + (data.notes || "N/A") + "\n" +
    "  Submitted At: " + (data.submittedAt || new Date().toISOString()) + "\n";

  GmailApp.sendEmail(CONFIG.ORGANISER_EMAIL, subject, body);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
