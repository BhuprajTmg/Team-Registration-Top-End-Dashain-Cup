/* =====================================================
   Gurkhali FC — Dashain Cup 2026 Team Registration
   Front-end logic: modal control, validation, submission
   to the Django backend (see registration/views.py), and
   a well-managed success/failure result popup.
   ===================================================== */

(function () {
  "use strict";

  const overlay = document.getElementById("modalOverlay");
  const openButtons = [document.getElementById("openFormBtn")].concat(
    Array.from(document.querySelectorAll('a[href="#register"]'))
  );
  const closeBtn = document.getElementById("modalClose");
  const form = document.getElementById("registrationForm");
  const statusEl = document.getElementById("formStatus");
  const submitBtn = document.getElementById("submitBtn");
  const yearEl = document.getElementById("year");

  const resultOverlay = document.getElementById("resultOverlay");
  const resultCard = document.getElementById("resultCard");
  const resultTitle = document.getElementById("resultTitle");
  const resultMessage = document.getElementById("resultMessage");
  const resultClose = document.getElementById("resultClose");
  const resultAction = document.getElementById("resultAction");

  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---------------- Registration form modal ----------------

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
    if (!resultOverlay.classList.contains("is-open")) {
      document.body.style.overflow = "";
    }
  }

  openButtons.forEach((btn) => {
    if (btn) btn.addEventListener("click", openModal);
  });

  closeBtn.addEventListener("click", closeModal);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  // ---------------- Result popup (success / failure) ----------------

  let resultReturnFocus = null;

  function showResultPopup(type, title, message) {
    resultOverlay.classList.remove("result-success", "result-error");
    resultOverlay.classList.add(type === "success" ? "result-success" : "result-error");

    resultTitle.textContent = title;
    resultMessage.innerHTML = message;

    resultReturnFocus = document.activeElement;

    resultOverlay.classList.add("is-open");
    resultOverlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    setTimeout(() => resultAction.focus(), 200);
  }

  function closeResultPopup() {
    resultOverlay.classList.remove("is-open");
    resultOverlay.setAttribute("aria-hidden", "true");

    if (!overlay.classList.contains("is-open")) {
      document.body.style.overflow = "";
    }

    if (resultReturnFocus && typeof resultReturnFocus.focus === "function") {
      resultReturnFocus.focus();
    }
  }

  resultClose.addEventListener("click", closeResultPopup);
  resultAction.addEventListener("click", closeResultPopup);

  resultOverlay.addEventListener("click", (e) => {
    if (e.target === resultOverlay) closeResultPopup();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (resultOverlay.classList.contains("is-open")) {
      closeResultPopup();
    } else if (overlay.classList.contains("is-open")) {
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

  function getCsrfToken() {
    const input = form.querySelector('input[name="csrfmiddlewaretoken"]');
    if (input) return input.value;

    // Fallback: read the csrftoken cookie directly.
    const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : "";
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

    const teamName = document.getElementById("teamName").value.trim();

    const payload = {
      team_name: teamName,
      manager_name: document.getElementById("managerName").value.trim(),
      home_city: document.getElementById("homeCity").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      gmail: gmail,
      squad_size: document.getElementById("squadSize").value,
      experience: document.getElementById("experience").value.trim(),
      notes: document.getElementById("notes").value.trim(),
      agree: document.getElementById("agree").checked
    };

    const registerUrl = form.dataset.registerUrl;

    setLoading(true);
    setStatus("Submitting your registration\u2026", "info");

    try {
      const response = await fetch(registerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken()
        },
        body: JSON.stringify(payload)
      });

      let result = {};
      try {
        result = await response.json();
      } catch (_) {
        result = { status: response.ok ? "ok" : "error" };
      }

      if (response.ok && result.status !== "error") {
        setStatus("", "");
        form.reset();
        form.querySelectorAll(".touched").forEach((f) => f.classList.remove("touched"));
        closeModal();
        showResultPopup(
          "success",
          "Registration Successful! \u{1F389}",
          result.message ||
            `Thanks, <strong>${escapeHtml(teamName)}</strong>! Your team is registered for the tournament. ` +
              `A confirmation email is on its way to <strong>${escapeHtml(gmail)}</strong>.`
        );
      } else {
        setStatus("", "");
        showResultPopup(
          "error",
          "Registration Failed",
          result.message ||
            "Something went wrong submitting your registration. Please check your details and try again."
        );
      }
    } catch (err) {
      setStatus("", "");
      showResultPopup(
        "error",
        "Registration Failed",
        "We couldn't reach the server \u2014 please check your internet connection and try again."
      );
    } finally {
      setLoading(false);
    }
  });

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
  }
})();
