/* =====================================================
   Gurkhali FC — Dashain Cup 2026 Team Registration
   Front-end logic: modal control, validation, submission
   to the Django backend (see registration/views.py).
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

    const payload = {
      team_name: document.getElementById("teamName").value.trim(),
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
        setStatus(result.message || `Thanks, ${payload.team_name}! Your registration is in.`, "success");
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
