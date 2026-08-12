/* =====================================================
   Gurkhali FC — Dashain Cup 2026 Team Registration
   Front-end logic: modal control, validation, submission.
   ===================================================== */

(function () {
  "use strict";

  /**
   * CONFIG.SUBMIT_URL should be the "Web app URL" you get after deploying
   * the included Google Apps Script (see /backend/Code.gs and the README)
   * as a web app. That script runs under your tournament Gmail account and
   * is what actually sends the confirmation + organizer notification emails.
   *
   * Until you deploy it, leave this as an empty string — the form will
   * still validate and show a friendly "not configured yet" message
   * instead of silently failing.
   */
  const CONFIG = {
    SUBMIT_URL: "", // e.g. "https://script.google.com/macros/s/AKfycb.../exec"
    TOURNAMENT: "Dashain Cup 2026",
    DIVISION: "Open 7A-side football competition"
  };

  const overlay = document.getElementById("modalOverlay");
  const openButtons = [document.getElementById("openFormBtn")].concat(
    Array.from(document.querySelectorAll('a[href="#register"]'))
  );
  const closeBtn = document.getElementById("modalClose");
  const form = document.getElementById("registrationForm");
  const statusEl = document.getElementById("formStatus");
  const submitBtn = document.getElementById("submitBtn");
  const yearEl = document.getElementById("year");

  if (yearEl) yearEl.textContent = new Date().getFullYear();

  function openModal(e) {
    if (e) e.preventDefault();
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    const firstField = form.querySelector("#teamName");
    if (firstField) setTimeout(() => firstField.focus(), 150);
  }

  function closeModal() {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  openButtons.forEach((btn) => {
    if (btn) btn.addEventListener("click", openModal);
  });

  closeBtn.addEventListener("click", closeModal);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("is-open")) {
      closeModal();
    }
  });

  // Mark fields as "touched" once a user interacts, so invalid styling
  // doesn't show up before they've had a chance to type anything.
  form.querySelectorAll("input, textarea, select").forEach((field) => {
    field.addEventListener("blur", () => field.classList.add("touched"));
  });

  function setStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = "form-status" + (type ? " " + type : "");
  }

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.classList.toggle("is-loading", isLoading);
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    form.querySelectorAll("input, textarea, select").forEach((field) => field.classList.add("touched"));

    if (!form.checkValidity()) {
      form.reportValidity();
      setStatus("Please fill in every required field with valid details.", "error");
      return;
    }

    const gmail = document.getElementById("gmail").value.trim();
    if (!/^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(gmail)) {
      setStatus("Please use a Gmail address (must end with @gmail.com) so we can send your confirmation.", "error");
      document.getElementById("gmail").focus();
      return;
    }

    const payload = {
      tournament: CONFIG.TOURNAMENT,
      division: CONFIG.DIVISION,
      teamName: document.getElementById("teamName").value.trim(),
      managerName: document.getElementById("managerName").value.trim(),
      homeCity: document.getElementById("homeCity").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      gmail: gmail,
      squadSize: document.getElementById("squadSize").value,
      experience: document.getElementById("experience").value.trim(),
      notes: document.getElementById("notes").value.trim(),
      submittedAt: new Date().toISOString()
    };

    if (!CONFIG.SUBMIT_URL) {
      setStatus(
        "Registration form isn't connected to the email backend yet. See README.md \u2014 deploy the Apps Script and set SUBMIT_URL in assets/js/script.js.",
        "error"
      );
      return;
    }

    setLoading(true);
    setStatus("Submitting your registration\u2026", "info");

    try {
      const response = await fetch(CONFIG.SUBMIT_URL, {
        method: "POST",
        // text/plain avoids a CORS pre-flight request against Apps Script,
        // which otherwise doesn't respond to OPTIONS requests.
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });

      let result = {};
      try {
        result = await response.json();
      } catch (_) {
        // Some deployments may not echo JSON back; treat any 200 as success.
        result = { status: response.ok ? "ok" : "error" };
      }

      if (response.ok && result.status !== "error") {
        setStatus(
          `Thanks, ${payload.teamName}! Your registration is in. A confirmation has been sent to ${payload.gmail}.`,
          "success"
        );
        form.reset();
        form.querySelectorAll(".touched").forEach((f) => f.classList.remove("touched"));
        setTimeout(closeModal, 3200);
      } else {
        setStatus(result.message || "Something went wrong submitting your registration. Please try again.", "error");
      }
    } catch (err) {
      setStatus("Network error \u2014 please check your connection and try again.", "error");
    } finally {
      setLoading(false);
    }
  });
})();
