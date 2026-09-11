/* =====================================================
   Gurkhali FC — Dashain Cup Team Registration
   Countdown, Premier Player squad table, Django API, and result popup.
   ===================================================== */

(function () {
  "use strict";

  var MIN_PLAYERS = 8;
  var MAX_PLAYERS = 12;
  var MAX_MPL = 3;
  var DEADLINE = new Date("2026-09-27T23:59:59+09:30").getTime();
  var allTeams = [];
  var cachedLogoDataUrl = null;
  var cachedReceiptDataUrl = null;

  var form = document.getElementById("team-form");
  if (!form) return;

  var squadBody = document.getElementById("squadBody");
  var addPlayerBtn = document.getElementById("add-player-btn");
  var playerCountLabel = document.getElementById("player-count-label");
  var playersError = document.getElementById("players-error");
  var mplNote = document.getElementById("mplNote");
  var submitBtn = document.getElementById("submit-btn");
  var formMsg = document.getElementById("form-msg");
  var agreeCheck = document.getElementById("agreeCheck");
  var agreeTermsCheck = document.getElementById("agreeTermsCheck");
  var rulesLink = document.getElementById("rules-link");
  var termsLink = document.getElementById("terms-link");
  var agreeRow = document.getElementById("field-agree");
  var termsRow = document.getElementById("field-terms");
  var modalRoot = document.getElementById("modal-root");

  var resultOverlay = document.getElementById("resultOverlay");
  var resultTitle = document.getElementById("resultTitle");
  var resultMessage = document.getElementById("resultMessage");
  var resultClose = document.getElementById("resultClose");
  var resultAction = document.getElementById("resultAction");
  var resultReturnFocus = null;

  var registerUrl = form.dataset.registerUrl;
  var teamsUrl = form.dataset.teamsUrl;

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  var copyPayid = document.getElementById("copy-payid");
  var bankDetails = document.getElementById("bank-details");
  var copyStatus = document.getElementById("copy-status");
  if (copyPayid && bankDetails) {
    copyPayid.addEventListener("click", function () {
      var value = (bankDetails.getAttribute("data-copy") || "").trim();
      function copied() {
        if (copyStatus) {
          copyStatus.hidden = false;
          setTimeout(function () {
            copyStatus.hidden = true;
          }, 2000);
        }
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(copied).catch(copied);
      } else {
        copied();
      }
    });
  }

  function escapeHtml(str) {
    var d = document.createElement("div");
    d.textContent = str == null ? "" : String(str);
    return d.innerHTML;
  }

  function getCsrfToken() {
    var input = form.querySelector('input[name="csrfmiddlewaretoken"]');
    if (input) return input.value;
    var match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  async function apiCall(url, payload) {
    if (!url) {
      return {
        ok: false,
        status: "error",
        message: "Registration URL is missing. Refresh the page and try again.",
        _httpOk: false,
        _status: 0,
      };
    }

    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timeoutId = null;
    if (controller) {
      timeoutId = setTimeout(function () {
        controller.abort();
      }, 45000);
    }

    try {
      var res = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken(),
        },
        body: JSON.stringify(payload || {}),
        signal: controller ? controller.signal : undefined,
      });
      var data = {};
      try {
        data = await res.json();
      } catch (_) {
        data = { ok: false, status: "error" };
        if (res.status === 403) {
          data.message =
            "Security check failed. Please refresh the page and try registering again.";
        } else if (res.status >= 500) {
          data.message =
            "The server had a problem saving your registration. Please try again in a moment.";
        } else if (!res.ok) {
          data.message =
            "Something went wrong submitting your registration (HTTP " +
            res.status +
            "). Please refresh and try again.";
        } else {
          data.message = "The server returned an unexpected response. Please try again.";
        }
      }
      data._httpOk = res.ok;
      data._status = res.status;
      return data;
    } catch (err) {
      var aborted = err && (err.name === "AbortError" || err.code === 20);
      return {
        ok: false,
        status: "error",
        message: aborted
          ? "The server took too long to respond. Check that runserver is still running, and that DATABASE_URL in .env is reachable (or remove it to use local SQLite)."
          : "Could not reach the registration server. Make sure `python manage.py runserver` is running and check the terminal for errors.",
        _httpOk: false,
        _status: 0,
        _networkError: true,
      };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  function teamApiUrl(teamId, action) {
    var base = teamsUrl.replace(/\/?$/, "/");
    return base + teamId + "/" + action + "/";
  }

  /* ---- Countdown ---- */
  function tickCountdown() {
    var now = Date.now();
    var diff = Math.max(0, DEADLINE - now);
    var d = Math.floor(diff / (1000 * 60 * 60 * 24));
    var h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    var m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    var s = Math.floor((diff % (1000 * 60)) / 1000);
    var set = function (id, val) {
      var el = document.getElementById(id);
      if (el) el.textContent = String(val).padStart(2, "0");
    };
    set("cd-days", d);
    set("cd-hours", h);
    set("cd-mins", m);
    set("cd-secs", s);
  }
  tickCountdown();
  setInterval(tickCountdown, 1000);

  /* ---- Result popup ---- */
  var pendingPaymentUrl = null;

  function showResultPopup(type, title, message, nextUrl) {
    pendingPaymentUrl = nextUrl || null;
    resultOverlay.classList.remove("result-success", "result-error");
    resultOverlay.classList.add(type === "success" ? "result-success" : "result-error");
    resultTitle.textContent = title;
    resultMessage.innerHTML = message;
    resultAction.textContent = pendingPaymentUrl ? "Continue to payment" : "Done";
    resultReturnFocus = document.activeElement;
    resultOverlay.classList.add("is-open");
    resultOverlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setTimeout(function () {
      resultAction.focus();
    }, 180);
  }

  function closeResultPopup() {
    resultOverlay.classList.remove("is-open");
    resultOverlay.setAttribute("aria-hidden", "true");
    if (!modalRoot || !modalRoot.innerHTML) document.body.style.overflow = "";
    if (resultReturnFocus && typeof resultReturnFocus.focus === "function") {
      resultReturnFocus.focus();
    }
  }

  resultClose.addEventListener("click", function () {
    if (pendingPaymentUrl) {
      window.location.href = pendingPaymentUrl;
      return;
    }
    closeResultPopup();
  });
  resultAction.addEventListener("click", function () {
    if (pendingPaymentUrl) {
      window.location.href = pendingPaymentUrl;
      return;
    }
    closeResultPopup();
  });
  resultOverlay.addEventListener("click", function (e) {
    if (e.target === resultOverlay) {
      if (pendingPaymentUrl) {
        window.location.href = pendingPaymentUrl;
        return;
      }
      closeResultPopup();
    }
  });

  /* ---- Squad table ---- */
  function rowCount() {
    return squadBody.querySelectorAll("tr").length;
  }

  function mplCount() {
    return squadBody.querySelectorAll('input[type="checkbox"]:checked').length;
  }

  function updateMplAvailability() {
    var checked = mplCount();
    squadBody.querySelectorAll(".mpl-input").forEach(function (cb) {
      cb.disabled = !cb.checked && checked >= MAX_MPL;
    });
    updateMplNote();
  }

  function updateMplNote() {
    var checked = mplCount();
    mplNote.textContent = checked + " of " + MAX_MPL + " Premier Players selected";
    mplNote.classList.toggle("warn", checked > MAX_MPL);
    if (checked >= MAX_MPL) {
      mplNote.textContent =
        MAX_MPL + " of " + MAX_MPL + " Premier Players selected — no more can be ticked";
    }
  }

  function updatePlayerCount() {
    var n = rowCount();
    playerCountLabel.textContent = n;
    addPlayerBtn.disabled = n >= MAX_PLAYERS;
    addPlayerBtn.textContent =
      n >= MAX_PLAYERS ? "Squad full (12 players)" : "+ Add another player";
  }

  function renumberRows() {
    squadBody.querySelectorAll("tr").forEach(function (tr, i) {
      tr.querySelector(".row-num").textContent = String(i + 1);
      var nameInput = tr.querySelector(".name-input");
      var mplInput = tr.querySelector(".mpl-input");
      nameInput.name = "player_" + (i + 1);
      var phoneInput = tr.querySelector(".player-phone-input");
      var gmailInput = tr.querySelector(".player-gmail-input");
      mplInput.name = "player_" + (i + 1) + "_mpl";
      if (phoneInput) phoneInput.name = "player_" + (i + 1) + "_phone";
      if (gmailInput) gmailInput.name = "player_" + (i + 1) + "_gmail";
    });
  }

  function wireMplCheckbox(cb) {
    cb.addEventListener("change", function () {
      if (this.checked && mplCount() > MAX_MPL) {
        this.checked = false;
      }
      updateMplAvailability();
    });
  }

  function addPlayerRow(prefill) {
    prefill = prefill || {};
    if (rowCount() >= MAX_PLAYERS) return;
    var idx = rowCount() + 1;
    var tr = document.createElement("tr");
    tr.innerHTML =
      '<td class="row-num">' +
      idx +
      "</td>" +
      '<td><input type="text" class="name-input" placeholder="Player full name" autocomplete="off" required value="' +
      (prefill.name ? escapeHtml(prefill.name) : "") +
      '"></td>' +
      '<td class="player-phone-cell"><input type="tel" class="player-phone-input phone-demo-input" inputmode="numeric" maxlength="16" placeholder="04********" autocomplete="off" required value="' +
      (prefill.phone ? escapeHtml(prefill.phone) : "") +
      '"></td>' +
      '<td><input type="email" class="player-gmail-input" placeholder="player@gmail.com" autocomplete="off" required value="' +
      (prefill.gmail ? escapeHtml(prefill.gmail) : "") +
      '"></td>' +
      '<td class="mpl-cell"><input type="checkbox" class="mpl-input" value="Yes"' +
      (prefill.mpl ? " checked" : "") +
      "></td>" +
      '<td class="col-remove"><button type="button" class="remove-player link-btn" aria-label="Remove player">&times;</button></td>';
    squadBody.appendChild(tr);
    wireMplCheckbox(tr.querySelector(".mpl-input"));
    wirePhoneInput(tr.querySelector(".player-phone-input"));
    tr.querySelector(".remove-player").addEventListener("click", function () {
      if (rowCount() <= MIN_PLAYERS) {
        playersError.textContent =
          "A registered squad needs at least " + MIN_PLAYERS + " player rows.";
        playersError.style.display = "block";
        return;
      }
      tr.remove();
      renumberRows();
      updatePlayerCount();
      updateMplAvailability();
      playersError.style.display = "none";
    });
    updatePlayerCount();
    updateMplAvailability();
  }

  addPlayerBtn.addEventListener("click", function () {
    addPlayerRow();
  });
  for (var i = 0; i < MIN_PLAYERS; i++) addPlayerRow();

  function collectPlayers(tbody) {
    var players = [];
    Array.prototype.slice.call(tbody.querySelectorAll("tr")).forEach(function (tr) {
      var name = tr.querySelector(".name-input").value.trim();
      var phoneEl = tr.querySelector(".player-phone-input");
      var gmailEl = tr.querySelector(".player-gmail-input");
      var phone = phoneEl ? phoneEl.value.trim() : "";
      var gmail = gmailEl ? gmailEl.value.trim() : "";
      var mpl = tr.querySelector(".mpl-input").checked;
      players.push({ name: name, phone: phone, gmail: gmail, mpl: mpl });
    });
    return players;
  }

  /* ---- Rules / terms modals ---- */
  function openContentModal(title, templateId) {
    var tpl = document.getElementById(templateId);
    if (!tpl) return;
    modalRoot.innerHTML =
      '<div class="modal-backdrop" id="doc-backdrop">' +
      '<div class="modal-box rules-modal-box" role="dialog" aria-modal="true">' +
      "<h3>" +
      title +
      "</h3>" +
      '<div id="doc-body"></div>' +
      '<div class="modal-actions"><button type="button" class="btn" id="doc-close-btn">Close</button></div>' +
      "</div></div>";
    document.getElementById("doc-body").appendChild(tpl.content.cloneNode(true));
    function closeDoc() {
      modalRoot.innerHTML = "";
    }
    document.getElementById("doc-close-btn").addEventListener("click", closeDoc);
    document.getElementById("doc-backdrop").addEventListener("click", function (e) {
      if (e.target.id === "doc-backdrop") closeDoc();
    });
  }

  if (rulesLink) {
    rulesLink.addEventListener("click", function (e) {
      e.preventDefault();
      openContentModal(
        "2nd Grace Dashain Cup — Official 7-a-side Rulebook",
        "rules-content-template"
      );
    });
  }
  if (termsLink) {
    termsLink.addEventListener("click", function (e) {
      e.preventDefault();
      openContentModal(
        "2nd Grace Dashain Cup — Terms and Conditions",
        "terms-content-template"
      );
    });
  }

  if (agreeCheck) {
    agreeCheck.addEventListener("change", function () {
      if (agreeCheck.checked) {
        openContentModal(
          "2nd Grace Dashain Cup — Official 7-a-side Rulebook",
          "rules-content-template"
        );
        if (agreeRow) agreeRow.classList.remove("err");
      }
    });
  }
  if (agreeTermsCheck) {
    agreeTermsCheck.addEventListener("change", function () {
      if (agreeTermsCheck.checked) {
        openContentModal(
          "2nd Grace Dashain Cup — Terms and Conditions",
          "terms-content-template"
        );
        if (termsRow) termsRow.classList.remove("err");
      }
    });
  }

  function clearFieldErrors() {
    [
      "field-teamname",
      "field-logo",
      "field-captain",
      "field-contact",
      "field-gmail",
      "field-agree",
      "field-terms",
      "field-squad",
      "field-category",
      "field-receipt",
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.remove("err");
    });
    squadBody.querySelectorAll(".name-input, .player-phone-input, .player-gmail-input").forEach(function (input) {
      input.classList.remove("is-invalid");
    });
    if (playersError) {
      playersError.style.display = "none";
      playersError.textContent =
        "You need at least 8 players. Premier Players are optional (maximum 3).";
    }
    if (formMsg) {
      formMsg.className = "form-msg";
      formMsg.style.display = "none";
    }
  }

  function setFieldError(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add("err");
  }

  function scrollToFirstError() {
    var first = form.querySelector(".err, .is-invalid");
    if (!first) return;
    var target = first.classList.contains("is-invalid")
      ? first
      : first.querySelector("input, select, textarea") || first;
    try {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      if (typeof target.focus === "function") target.focus({ preventScroll: true });
    } catch (_) {
      /* ignore */
    }
  }

  function readOptionalField(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function sanitizePhoneInput(rawPhone) {
    var cleaned = String(rawPhone || "").replace(/[^\d+()\s-]/g, "");
    var plus = cleaned.charAt(0) === "+" ? "+" : "";
    return plus + cleaned.replace(/\+/g, "").replace(/[^\d()\s-]/g, "");
  }

  function wirePhoneInput(input, fieldId) {
    if (!input) return;
    input.addEventListener("keydown", function (event) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) {
        return;
      }
      if (!/[0-9+() \-]/.test(event.key)) {
        event.preventDefault();
      }
    });
    input.addEventListener("input", function () {
      var cleaned = sanitizePhoneInput(this.value);
      if (cleaned !== this.value) this.value = cleaned;
      if (fieldId && normalizeAustralianPhone(this.value)) {
        var wrap = document.getElementById(fieldId);
        if (wrap) wrap.classList.remove("err");
      }
    });
    input.addEventListener("paste", function (event) {
      event.preventDefault();
      this.value = sanitizePhoneInput(event.clipboardData ? event.clipboardData.getData("text") || "" : "");
      this.dispatchEvent(new Event("input", { bubbles: true }));
    });
    if (fieldId) {
      input.addEventListener("blur", function () {
        var wrap = document.getElementById(fieldId);
        if (!wrap) return;
        this.value = sanitizePhoneInput(this.value);
        wrap.classList.toggle("err", !normalizeAustralianPhone(this.value));
      });
    }
  }

  function normalizeAustralianPhone(rawPhone) {
    var compact = sanitizePhoneInput(rawPhone).replace(/[\s().-]/g, "");
    if (/^0[23478]\d{8}$/.test(compact)) return compact;
    if (/^\+61[23478]\d{8}$/.test(compact)) return "0" + compact.slice(3);
    return null;
  }

  function validateRegistrationForm() {
    clearFieldErrors();
    var missing = [];

    var teamName = readOptionalField("teamName");
    var captainName = readOptionalField("captainName");
    var contactPhone = readOptionalField("contactPhone");
    var gmail = readOptionalField("gmail");
    var category = readOptionalField("teamCategory");
    var players = collectPlayers(squadBody);

    if (!teamName) {
      setFieldError("field-teamname");
      missing.push("Team name");
    }
    if (!captainName) {
      setFieldError("field-captain");
      missing.push("Contact full name");
    }
    var normalizedPhone = normalizeAustralianPhone(contactPhone);
    var phoneError = document.getElementById("phone-error");
    if (!contactPhone) {
      setFieldError("field-contact");
      missing.push("Phone number");
    } else if (!normalizedPhone) {
      setFieldError("field-contact");
      if (phoneError) {
        phoneError.textContent =
          "Enter a valid Australian phone number, for example 0400 123 456.";
      }
      missing.push("Valid Australian phone number");
    }
    if (!gmail) {
      setFieldError("field-gmail");
      missing.push("Team Gmail");
    } else if (!/^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(gmail)) {
      setFieldError("field-gmail");
      missing.push("Team Gmail must end with @gmail.com");
    }
    if (category !== "mens" && category !== "veteran") {
      setFieldError("field-category");
      missing.push("Team category (Men's or Veteran)");
    }

    var logoInput = document.getElementById("teamLogo");
    var logoFile = logoInput && logoInput.files && logoInput.files[0] ? logoInput.files[0] : null;
    var logoError = document.getElementById("logo-error");
    if (!logoFile) {
      setFieldError("field-logo");
      if (logoError) {
        logoError.textContent = "Upload a team logo. This field is required.";
      }
      missing.push("Team logo");
    } else if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(logoFile.type)) {
      setFieldError("field-logo");
      if (logoError) {
        logoError.textContent = "Team logo must be a JPG, PNG, WEBP, or GIF image.";
      }
      missing.push("Team logo (JPG, PNG, WEBP or GIF only)");
    } else if (logoFile.size > 1024 * 1024) {
      setFieldError("field-logo");
      if (logoError) {
        logoError.textContent = "Team logo must be 1 MB or smaller.";
      }
      missing.push("Team logo (max 1 MB)");
    }

    if (!agreeCheck || !agreeCheck.checked) {
      setFieldError("field-agree");
      missing.push("Rulebook agreement");
    }
    if (!agreeTermsCheck || !agreeTermsCheck.checked) {
      setFieldError("field-terms");
      missing.push("Terms and Conditions agreement");
    }

    var receiptInput = document.getElementById("receiptFile");
    var receiptFile = receiptInput && receiptInput.files && receiptInput.files[0] ? receiptInput.files[0] : null;
    var receiptError = document.getElementById("receipt-error");
    if (!receiptFile && !cachedReceiptDataUrl) {
      setFieldError("field-receipt");
      if (receiptError) {
        receiptError.textContent = "Upload a screenshot of your PayID bank transfer.";
      }
      missing.push("PayID payment screenshot");
    } else if (receiptFile && !/^image\/(jpeg|jpg|png|webp|gif)$/i.test(receiptFile.type)) {
      setFieldError("field-receipt");
      if (receiptError) {
        receiptError.textContent = "Screenshot must be a JPG, PNG, WEBP, or GIF image.";
      }
      missing.push("PayID screenshot (JPG, PNG, WEBP or GIF only)");
    } else if (receiptFile && receiptFile.size > 2 * 1024 * 1024) {
      setFieldError("field-receipt");
      if (receiptError) {
        receiptError.textContent = "Screenshot must be 2 MB or smaller.";
      }
      missing.push("PayID screenshot (max 2 MB)");
    }

    squadBody.querySelectorAll(".name-input, .player-phone-input, .player-gmail-input").forEach(function (input) {
      input.classList.remove("is-invalid");
    });

    var filledPlayers = [];
    var phoneSeen = {};
    var gmailSeen = {};
    var squadIssues = [];
    squadBody.querySelectorAll("tr").forEach(function (tr) {
      var nameInput = tr.querySelector(".name-input");
      var phoneInput = tr.querySelector(".player-phone-input");
      var gmailInput = tr.querySelector(".player-gmail-input");
      var name = nameInput.value.trim();
      var normalizedPhone = normalizeAustralianPhone(phoneInput.value);
      var playerGmail = gmailInput.value.trim().toLowerCase();
      var mpl = tr.querySelector(".mpl-input").checked;
      if (!name) {
        nameInput.classList.add("is-invalid");
        squadIssues.push("name");
      }
      if (!normalizedPhone) {
        phoneInput.classList.add("is-invalid");
        squadIssues.push("phone");
      } else if (phoneSeen[normalizedPhone]) {
        phoneInput.classList.add("is-invalid");
        squadIssues.push("duplicate-phone");
      } else {
        phoneSeen[normalizedPhone] = true;
      }
      if (!/^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(playerGmail)) {
        gmailInput.classList.add("is-invalid");
        squadIssues.push("gmail");
      } else if (gmailSeen[playerGmail]) {
        gmailInput.classList.add("is-invalid");
        squadIssues.push("duplicate-gmail");
      } else {
        gmailSeen[playerGmail] = true;
      }
      if (name && normalizedPhone && /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(playerGmail)) {
        filledPlayers.push({
          name: name,
          phone: normalizedPhone,
          gmail: playerGmail,
          mpl: mpl,
        });
      }
    });

    if (squadIssues.length) {
      setFieldError("field-squad");
      if (playersError) {
        playersError.textContent =
          "Every player needs a name, Australian phone number (numbers only), and Gmail. Phone numbers and Gmails cannot be repeated.";
        playersError.style.display = "block";
      }
      missing.push("Player name, phone number and Gmail for every row");
    } else if (filledPlayers.length < MIN_PLAYERS) {
      setFieldError("field-squad");
      if (playersError) {
        playersError.textContent =
          "Enter at least " +
          MIN_PLAYERS +
          " complete players (you have " +
          filledPlayers.length +
          ").";
        playersError.style.display = "block";
      }
      missing.push("At least " + MIN_PLAYERS + " complete players");
    }

    players = filledPlayers;

    var mplSelected = players.filter(function (p) {
      return p.mpl;
    }).length;
    if (mplSelected > MAX_MPL) {
      setFieldError("field-squad");
      if (mplNote) mplNote.classList.add("warn");
      if (playersError) {
        playersError.textContent = "A squad may include at most 3 Premier Players.";
        playersError.style.display = "block";
      }
      missing.push("Premier Players (max 3)");
    }

    return {
      valid: missing.length === 0,
      missing: missing,
      values: {
        teamName: teamName,
        captainName: captainName,
        contactPhone: normalizedPhone || contactPhone,
        gmail: gmail,
        category: category,
        players: players,
      },
    };
  }

  function readImageAsDataUrl(file, label, maxBytes) {
    return new Promise(function (resolve, reject) {
      if (!file) {
        resolve(null);
        return;
      }
      if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type)) {
        reject(new Error(label + " must be a JPG, PNG, WEBP, or GIF image."));
        return;
      }
      if (file.size > maxBytes) {
        var maxMb = Math.max(1, Math.floor(maxBytes / (1024 * 1024)));
        reject(new Error(label + " must be " + maxMb + " MB or smaller."));
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = function () {
        reject(new Error("Could not read the " + label.toLowerCase() + " file."));
      };
      reader.readAsDataURL(file);
    });
  }

  function readLogoAsDataUrl(file) {
    return readImageAsDataUrl(file, "Team logo", 1024 * 1024);
  }

  function readReceiptAsDataUrl(file) {
    return readImageAsDataUrl(file, "Payment screenshot", 2 * 1024 * 1024);
  }

  async function handleRegistrationSubmit(e) {
    if (e) e.preventDefault();

    var validation = validateRegistrationForm();
    if (!validation.valid) {
      scrollToFirstError();
      showResultPopup(
        "error",
        "Please complete the form",
        "These items need attention:<ul style=\"text-align:left;margin:12px 0 0;padding-left:1.2rem;\">" +
          validation.missing
            .map(function (item) {
              return "<li>" + escapeHtml(item) + "</li>";
            })
            .join("") +
          "</ul>"
      );
      return;
    }

    var logoInput = document.getElementById("teamLogo");
    var teamLogo = cachedLogoDataUrl;
    try {
      if (!teamLogo) {
        teamLogo = await readLogoAsDataUrl(
          logoInput && logoInput.files && logoInput.files[0] ? logoInput.files[0] : null
        );
        cachedLogoDataUrl = teamLogo;
      }
    } catch (logoErr) {
      setFieldError("field-logo");
      scrollToFirstError();
      showResultPopup(
        "error",
        "Logo upload issue",
        logoErr.message || "Invalid team logo."
      );
      return;
    }
    if (!teamLogo) {
      setFieldError("field-logo");
      scrollToFirstError();
      showResultPopup(
        "error",
        "Please complete the form",
        "Team logo is required."
      );
      return;
    }

    var receiptInput = document.getElementById("receiptFile");
    var paymentReceipt = cachedReceiptDataUrl;
    try {
      if (!paymentReceipt) {
        paymentReceipt = await readReceiptAsDataUrl(
          receiptInput && receiptInput.files && receiptInput.files[0] ? receiptInput.files[0] : null
        );
        cachedReceiptDataUrl = paymentReceipt;
      }
    } catch (receiptErr) {
      setFieldError("field-receipt");
      scrollToFirstError();
      showResultPopup(
        "error",
        "Payment screenshot issue",
        receiptErr.message || "Invalid payment screenshot."
      );
      return;
    }
    if (!paymentReceipt) {
      setFieldError("field-receipt");
      scrollToFirstError();
      showResultPopup(
        "error",
        "Please complete the form",
        "Upload a screenshot of your PayID bank transfer."
      );
      return;
    }

    var values = validation.values;
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";

    try {
      var result = await apiCall(registerUrl, {
        teamName: values.teamName,
        captainName: values.captainName,
        contactPhone: values.contactPhone,
        gmail: values.gmail,
        category: values.category,
        players: values.players,
        teamLogo: teamLogo,
        receipt: paymentReceipt,
        agree: true,
        agreeTerms: true,
      });

      if (result._httpOk && result.ok !== false && result.status !== "error") {
        form.reset();
        cachedLogoDataUrl = null;
        cachedReceiptDataUrl = null;
        var receiptPreview = document.getElementById("receipt-preview");
        if (receiptPreview) {
          receiptPreview.removeAttribute("src");
          receiptPreview.style.display = "none";
        }
        var contactPhone = document.getElementById("contactPhone");
        if (contactPhone) contactPhone.value = "";
        squadBody.innerHTML = "";
        for (var i = 0; i < MIN_PLAYERS; i++) addPlayerRow();
        updateMplAvailability();
        if (result.team) {
          allTeams = allTeams.concat([result.team]);
          updateStats();
        } else {
          loadTeams().then(updateStats);
        }
        showResultPopup(
          "success",
          "Registration Successful!",
          result.message ||
            "Thanks, <strong>" +
              escapeHtml(values.teamName) +
              "</strong>! Your squad and PayID screenshot are on the list."
        );
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        showResultPopup(
          "error",
          "Registration Failed",
          result.message ||
            "Something went wrong submitting your registration. Please check your details and try again."
        );
      }
    } catch (err) {
      showResultPopup(
        "error",
        "Registration Failed",
        (err && err.message) ||
          "Could not reach the registration server. Make sure runserver is running and check the terminal for errors."
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit registration";
    }
  }

  form.addEventListener("submit", handleRegistrationSubmit);

  function wireRequiredInput(inputId, fieldId) {
    var input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener("blur", function () {
      if (!String(input.value || "").trim()) {
        setFieldError(fieldId);
      } else {
        var wrap = document.getElementById(fieldId);
        if (wrap) wrap.classList.remove("err");
      }
    });
    input.addEventListener("input", function () {
      if (String(input.value || "").trim()) {
        var wrap = document.getElementById(fieldId);
        if (wrap) wrap.classList.remove("err");
      }
    });
  }

  wireRequiredInput("teamName", "field-teamname");
  wireRequiredInput("captainName", "field-captain");
  wireRequiredInput("gmail", "field-gmail");
  wireRequiredInput("teamCategory", "field-category");
  wirePhoneInput(document.getElementById("contactPhone"), "field-contact");

  var receiptInputLive = document.getElementById("receiptFile");
  var receiptPreview = document.getElementById("receipt-preview");
  if (receiptInputLive) {
    receiptInputLive.addEventListener("change", function () {
      cachedReceiptDataUrl = null;
      var file = receiptInputLive.files && receiptInputLive.files[0];
      var wrap = document.getElementById("field-receipt");
      if (!file) {
        if (receiptPreview) receiptPreview.style.display = "none";
        return;
      }
      readReceiptAsDataUrl(file)
        .then(function (url) {
          cachedReceiptDataUrl = url;
          if (receiptPreview) {
            receiptPreview.src = url;
            receiptPreview.style.display = "block";
          }
          if (wrap) wrap.classList.remove("err");
        })
        .catch(function (err) {
          cachedReceiptDataUrl = null;
          if (receiptPreview) receiptPreview.style.display = "none";
          if (wrap) wrap.classList.add("err");
          var receiptError = document.getElementById("receipt-error");
          if (receiptError) receiptError.textContent = err.message;
        });
    });
  }

  var logoInputLive = document.getElementById("teamLogo");
  if (logoInputLive) {
    logoInputLive.addEventListener("change", function () {
      var wrap = document.getElementById("field-logo");
      cachedLogoDataUrl = null;
      if (!wrap) return;
      if (logoInputLive.files && logoInputLive.files[0]) {
        wrap.classList.remove("err");
        readLogoAsDataUrl(logoInputLive.files[0])
          .then(function (dataUrl) {
            cachedLogoDataUrl = dataUrl;
          })
          .catch(function () {
            cachedLogoDataUrl = null;
          });
      } else {
        wrap.classList.add("err");
      }
    });
  }

  squadBody.addEventListener("blur", function (event) {
    if (!event.target || !event.target.classList.contains("name-input")) return;
    if (!event.target.value.trim()) {
      event.target.classList.add("is-invalid");
      setFieldError("field-squad");
      if (playersError) {
        playersError.textContent = "Every player row must have a full name.";
        playersError.style.display = "block";
      }
    }
  }, true);
  squadBody.addEventListener("input", function (event) {
    if (!event.target || !event.target.classList.contains("name-input")) return;
    if (event.target.value.trim()) {
      event.target.classList.remove("is-invalid");
    }
  });

  /* ---- Hero registration stats ---- */
  async function loadTeams() {
    try {
      var res = await fetch(teamsUrl);
      var data = await res.json();
      allTeams = data && data.teams ? data.teams : [];
    } catch (err) {
      allTeams = [];
    }
  }

  function updateStats() {
    var teamsEl = document.getElementById("stat-teams");
    var playersEl = document.getElementById("stat-players");
    var latestEl = document.getElementById("stat-latest");
    if (!teamsEl || !playersEl || !latestEl) return;

    teamsEl.textContent = String(allTeams.length);
    var totalPlayers = allTeams.reduce(function (sum, t) {
      return sum + (t.players ? t.players.length : 0);
    }, 0);
    playersEl.textContent = String(totalPlayers);

    var latestLabel = "–";
    if (allTeams.length) {
      var sorted = allTeams.slice().sort(function (a, b) {
        return new Date(b.registeredAt) - new Date(a.registeredAt);
      });
      latestLabel =
        sorted[0].teamName.length > 14
          ? sorted[0].teamName.slice(0, 13) + "…"
          : sorted[0].teamName;
    }
    latestEl.textContent = latestLabel;
  }

  function closeModal() {
    if (!modalRoot) return;
    modalRoot.innerHTML = "";
    if (!resultOverlay.classList.contains("is-open")) {
      document.body.style.overflow = "";
    }
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (resultOverlay.classList.contains("is-open")) closeResultPopup();
    else if (modalRoot && modalRoot.innerHTML) closeModal();
  });

  updatePlayerCount();
  updateMplNote();
  loadTeams().then(updateStats);
})();
