/* =====================================================
   Gurkhali FC — Dashain Cup Team Registration
   Countdown, MPL squad table, Django API, teams list,
   PIN manage, and result popup.
   ===================================================== */

(function () {
  "use strict";

  var MIN_PLAYERS = 7;
  var MAX_PLAYERS = 12;
  var MAX_MPL = 3;
  var DEADLINE = new Date("2026-09-27T23:59:59+09:30").getTime();
  var allTeams = [];

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
  var rulesLink = document.getElementById("rules-link");
  var agreeRow = document.getElementById("field-agree");
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
    var res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCsrfToken(),
      },
      body: JSON.stringify(payload || {}),
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
      }
    }
    data._httpOk = res.ok;
    data._status = res.status;
    return data;
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
  function showResultPopup(type, title, message) {
    resultOverlay.classList.remove("result-success", "result-error");
    resultOverlay.classList.add(type === "success" ? "result-success" : "result-error");
    resultTitle.textContent = title;
    resultMessage.innerHTML = message;
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
    if (!modalRoot.innerHTML) document.body.style.overflow = "";
    if (resultReturnFocus && typeof resultReturnFocus.focus === "function") {
      resultReturnFocus.focus();
    }
  }

  resultClose.addEventListener("click", closeResultPopup);
  resultAction.addEventListener("click", closeResultPopup);
  resultOverlay.addEventListener("click", function (e) {
    if (e.target === resultOverlay) closeResultPopup();
  });

  /* ---- Squad table ---- */
  function rowCount() {
    return squadBody.querySelectorAll("tr").length;
  }

  function mplCount() {
    return squadBody.querySelectorAll('input[type="checkbox"]:checked').length;
  }

  function updateMplNote() {
    var checked = mplCount();
    mplNote.textContent = checked + " of " + MAX_MPL + " MPL players selected";
    mplNote.classList.toggle("warn", checked > MAX_MPL);
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
      mplInput.name = "player_" + (i + 1) + "_mpl";
    });
  }

  function wireMplCheckbox(cb) {
    cb.addEventListener("change", function () {
      if (mplCount() > MAX_MPL) {
        this.checked = false;
      }
      updateMplNote();
    });
  }

  function addPlayerRow(prefillName, prefillMpl) {
    if (rowCount() >= MAX_PLAYERS) return;
    var idx = rowCount() + 1;
    var tr = document.createElement("tr");
    tr.innerHTML =
      '<td class="row-num">' +
      idx +
      "</td>" +
      '<td><input type="text" class="name-input" placeholder="Player full name" autocomplete="off" value="' +
      (prefillName ? escapeHtml(prefillName) : "") +
      '"></td>' +
      '<td class="mpl-cell"><input type="checkbox" class="mpl-input" value="Yes"' +
      (prefillMpl ? " checked" : "") +
      "></td>" +
      '<td class="col-remove"><button type="button" class="remove-player link-btn" aria-label="Remove player">&times;</button></td>';
    squadBody.appendChild(tr);
    wireMplCheckbox(tr.querySelector(".mpl-input"));
    tr.querySelector(".remove-player").addEventListener("click", function () {
      if (rowCount() <= MIN_PLAYERS) {
        playersError.textContent =
          "A 7-a-side squad needs at least " + MIN_PLAYERS + " player rows.";
        playersError.style.display = "block";
        return;
      }
      tr.remove();
      renumberRows();
      updatePlayerCount();
      updateMplNote();
      playersError.style.display = "none";
    });
    updatePlayerCount();
    updateMplNote();
  }

  addPlayerBtn.addEventListener("click", function () {
    addPlayerRow();
  });
  for (var i = 0; i < MIN_PLAYERS; i++) addPlayerRow();

  function collectPlayers(tbody) {
    var players = [];
    Array.prototype.slice.call(tbody.querySelectorAll("tr")).forEach(function (tr) {
      var name = tr.querySelector(".name-input").value.trim();
      var mpl = tr.querySelector(".mpl-input").checked;
      if (name) players.push({ name: name, jersey: null, mpl: mpl });
    });
    return players;
  }

  /* ---- Rules modal ---- */
  function openRulesModal() {
    var tpl = document.getElementById("rules-content-template");
    modalRoot.innerHTML =
      '<div class="modal-backdrop" id="rules-backdrop">' +
      '<div class="modal-box rules-modal-box" role="dialog" aria-modal="true">' +
      "<h3>Dashain Cup — Rules &amp; Agreement</h3>" +
      '<div id="rules-body"></div>' +
      '<div class="modal-actions"><button type="button" class="btn" id="rules-close-btn">Close</button></div>' +
      "</div></div>";
    document.getElementById("rules-body").appendChild(tpl.content.cloneNode(true));
    function closeRules() {
      modalRoot.innerHTML = "";
    }
    document.getElementById("rules-close-btn").addEventListener("click", closeRules);
    document.getElementById("rules-backdrop").addEventListener("click", function (e) {
      if (e.target.id === "rules-backdrop") closeRules();
    });
  }

  rulesLink.addEventListener("click", function (e) {
    e.preventDefault();
    openRulesModal();
  });

  agreeCheck.addEventListener("change", function () {
    if (agreeCheck.checked) {
      openRulesModal();
      agreeRow.classList.remove("err");
    }
  });

  function clearFieldErrors() {
    [
      "field-teamname",
      "field-captain",
      "field-contact",
      "field-gmail",
      "field-pin",
      "field-pin-confirm",
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.remove("err");
    });
    agreeRow.classList.remove("err");
    playersError.style.display = "none";
    playersError.textContent =
      "You need at least 7 players to register a 7-a-side squad.";
    if (formMsg) {
      formMsg.className = "form-msg";
      formMsg.style.display = "none";
    }
  }

  function setFieldError(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add("err");
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    clearFieldErrors();

    var teamName = document.getElementById("teamName").value.trim();
    var captainName = document.getElementById("captainName").value.trim();
    var contactPhone = document.getElementById("contactPhone").value.trim();
    var gmail = document.getElementById("gmail").value.trim();
    var pin = document.getElementById("teamPin").value.trim();
    var pinConfirm = document.getElementById("teamPinConfirm").value.trim();
    var players = collectPlayers(squadBody);

    var valid = true;
    if (!teamName) {
      setFieldError("field-teamname");
      valid = false;
    }
    if (!captainName) {
      setFieldError("field-captain");
      valid = false;
    }
    if (!contactPhone) {
      setFieldError("field-contact");
      valid = false;
    }
    if (!/^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(gmail)) {
      setFieldError("field-gmail");
      valid = false;
    }
    if (!/^[0-9]{4}$/.test(pin)) {
      setFieldError("field-pin");
      valid = false;
    }
    if (pin !== pinConfirm || !pinConfirm) {
      setFieldError("field-pin-confirm");
      valid = false;
    }
    if (!agreeCheck.checked) {
      agreeRow.classList.add("err");
      valid = false;
    }
    if (players.length < MIN_PLAYERS) {
      playersError.style.display = "block";
      valid = false;
    }
    if (players.filter(function (p) { return p.mpl; }).length > MAX_MPL) {
      mplNote.classList.add("warn");
      playersError.textContent = "A squad may include at most 3 current MPL players.";
      playersError.style.display = "block";
      valid = false;
    }
    if (!valid) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";

    try {
      var result = await apiCall(registerUrl, {
        teamName: teamName,
        captainName: captainName,
        contactPhone: contactPhone,
        gmail: gmail,
        pin: pin,
        players: players,
        agree: true,
      });

      if (result._httpOk && result.ok !== false && result.status !== "error") {
        form.reset();
        squadBody.innerHTML = "";
        for (var i = 0; i < MIN_PLAYERS; i++) addPlayerRow();
        updateMplNote();
        await loadTeams();
        renderTeams();
        showResultPopup(
          "success",
          "Registration Successful!",
          result.message ||
            "Thanks, <strong>" +
              escapeHtml(teamName) +
              "</strong>! Your squad is on the list. Keep your PIN safe — a confirmation is on its way to your Gmail."
        );
        window.scrollTo({
          top: document.getElementById("teams").offsetTop - 20,
          behavior: "smooth",
        });
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
        "We couldn't reach the server — please check your internet connection and try again."
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit registration";
    }
  });

  /* ---- Teams list ---- */
  async function loadTeams() {
    try {
      var res = await fetch(teamsUrl);
      var data = await res.json();
      allTeams = data && data.teams ? data.teams : [];
    } catch (err) {
      allTeams = [];
    }
  }

  function fmtDate(iso) {
    try {
      var d = new Date(iso);
      return (
        d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) +
        " at " +
        d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      );
    } catch (e) {
      return "";
    }
  }

  function initials(name) {
    var parts = name.trim().split(/\s+/).slice(0, 2);
    return parts
      .map(function (p) {
        return p[0] ? p[0].toUpperCase() : "";
      })
      .join("");
  }

  function renderTeams() {
    var region = document.getElementById("teams-list-region");
    var searchEl = document.getElementById("search-teams");
    var query = (searchEl && searchEl.value ? searchEl.value : "").toLowerCase().trim();

    var filtered = allTeams.filter(function (t) {
      if (!query) return true;
      return (
        (t.teamName || "").toLowerCase().indexOf(query) !== -1 ||
        (t.captainName || "").toLowerCase().indexOf(query) !== -1
      );
    });

    if (!allTeams.length) {
      region.innerHTML =
        '<div class="team-empty"><strong>No teams yet</strong><br>Be the first to register your squad for the Dashain Cup.</div>';
      return;
    }
    if (!filtered.length) {
      region.innerHTML =
        '<div class="team-empty"><strong>No matches</strong><br>Try a different team or contact name.</div>';
      return;
    }

    var sorted = filtered.slice().sort(function (a, b) {
      return new Date(b.registeredAt) - new Date(a.registeredAt);
    });

    var html = '<div class="teams-list">';
    sorted.forEach(function (t) {
      var rosterHtml = (t.players || [])
        .map(function (p) {
          return (
            '<div class="roster-item">' +
            escapeHtml(p.name) +
            (p.mpl ? ' <span class="mpl-tag">MPL</span>' : "") +
            "</div>"
          );
        })
        .join("");
      html +=
        '<div class="team-card">' +
        '<div class="team-card-head">' +
        '<div class="team-name-block">' +
        '<div class="team-badge">' +
        escapeHtml(initials(t.teamName)) +
        "</div>" +
        '<div class="team-name-text">' +
        "<h4>" +
        escapeHtml(t.teamName) +
        "</h4>" +
        '<div class="team-meta">Contact: ' +
        escapeHtml(t.captainName) +
        "</div>" +
        "</div></div>" +
        '<div class="team-card-right">' +
        '<span class="roster-count">' +
        (t.players ? t.players.length : 0) +
        " players</span>" +
        '<button type="button" class="btn btn-ghost manage-btn" data-team-id="' +
        escapeHtml(t.id) +
        '">Manage</button>' +
        '<span class="chevron" aria-hidden="true">&#9662;</span>' +
        "</div></div>" +
        '<div class="team-card-body"><div class="team-card-body-inner">' +
        '<div class="contact-line">Phone: ' +
        escapeHtml(t.contactPhone) +
        "</div>" +
        '<div class="roster-grid">' +
        rosterHtml +
        "</div>" +
        '<div class="reg-date">Registered ' +
        fmtDate(t.registeredAt) +
        "</div>" +
        "</div></div></div>";
    });
    html += "</div>";
    region.innerHTML = html;

    region.querySelectorAll(".team-card-head").forEach(function (head) {
      head.addEventListener("click", function (e) {
        if (e.target.closest(".manage-btn")) return;
        var card = head.closest(".team-card");
        var body = card.querySelector(".team-card-body");
        var isOpen = card.classList.contains("open");
        if (isOpen) {
          card.classList.remove("open");
          body.style.maxHeight = null;
        } else {
          card.classList.add("open");
          body.style.maxHeight = body.scrollHeight + "px";
        }
      });
    });

    region.querySelectorAll(".manage-btn").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        openPinModal(btn.getAttribute("data-team-id"));
      });
    });
  }

  var searchTeams = document.getElementById("search-teams");
  if (searchTeams) searchTeams.addEventListener("input", renderTeams);

  function closeModal() {
    modalRoot.innerHTML = "";
    if (!resultOverlay.classList.contains("is-open")) {
      document.body.style.overflow = "";
    }
  }

  function openPinModal(teamId) {
    var team = allTeams.find(function (t) {
      return String(t.id) === String(teamId);
    });
    if (!team) return;
    modalRoot.innerHTML =
      '<div class="modal-backdrop" id="pin-backdrop">' +
      '<div class="modal-box" role="dialog" aria-modal="true">' +
      "<h3>Manage &quot;" +
      escapeHtml(team.teamName) +
      "&quot;</h3>" +
      "<p>Enter the 4-digit PIN this team set at registration.</p>" +
      '<label for="pin-input">Team PIN</label>' +
      '<input type="password" id="pin-input" inputmode="numeric" maxlength="4" placeholder="••••">' +
      '<div class="modal-error" id="pin-modal-error"></div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn btn-ghost" id="pin-cancel">Cancel</button>' +
      '<button type="button" class="btn" id="pin-confirm">Unlock</button>' +
      "</div></div></div>";

    var input = document.getElementById("pin-input");
    input.focus();
    document.getElementById("pin-cancel").addEventListener("click", closeModal);
    document.getElementById("pin-backdrop").addEventListener("click", function (e) {
      if (e.target.id === "pin-backdrop") closeModal();
    });

    async function tryUnlock() {
      var pin = input.value.trim();
      var errBox = document.getElementById("pin-modal-error");
      if (!/^[0-9]{4}$/.test(pin)) {
        errBox.textContent = "Enter the 4-digit PIN.";
        return;
      }
      var confirmBtn = document.getElementById("pin-confirm");
      confirmBtn.disabled = true;
      var data = await apiCall(teamApiUrl(team.id, "verify-pin"), { pin: pin });
      confirmBtn.disabled = false;
      if (data && data.ok) {
        closeModal();
        openEditModal(team.id, pin);
      } else {
        errBox.textContent = "That PIN is incorrect for this team.";
        input.value = "";
        input.focus();
      }
    }
    document.getElementById("pin-confirm").addEventListener("click", tryUnlock);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") tryUnlock();
    });
  }

  function openEditModal(teamId, verifiedPin) {
    var team = allTeams.find(function (t) {
      return String(t.id) === String(teamId);
    });
    if (!team) return;

    var rosterRows = (team.players || [])
      .map(function (p, i) {
        return (
          "<tr>" +
          '<td class="row-num">' +
          (i + 1) +
          "</td>" +
          '<td><input type="text" class="name-input" value="' +
          escapeHtml(p.name) +
          '" placeholder="Player full name"></td>' +
          '<td class="mpl-cell"><input type="checkbox" class="mpl-input" value="Yes"' +
          (p.mpl ? " checked" : "") +
          "></td>" +
          '<td class="col-remove"><button type="button" class="remove-player link-btn" aria-label="Remove">&times;</button></td>' +
          "</tr>"
        );
      })
      .join("");

    modalRoot.innerHTML =
      '<div class="modal-backdrop" id="edit-backdrop">' +
      '<div class="modal-box modal-wide" role="dialog" aria-modal="true">' +
      '<div class="edit-toolbar">' +
      "<h3>Edit &quot;" +
      escapeHtml(team.teamName) +
      "&quot;</h3>" +
      '<button type="button" class="btn btn-danger" id="edit-delete-btn">Withdraw team</button>' +
      "</div>" +
      "<p>Update details below and save. Max 3 MPL players.</p>" +
      '<div class="field-row single"><div><label for="edit-teamName">Team name</label>' +
      '<input type="text" id="edit-teamName" value="' +
      escapeHtml(team.teamName) +
      '"></div></div>' +
      '<div class="field-row"><div><label for="edit-captainName">Contact name</label>' +
      '<input type="text" id="edit-captainName" value="' +
      escapeHtml(team.captainName) +
      '"></div>' +
      '<div><label for="edit-contactPhone">Phone</label>' +
      '<input type="text" id="edit-contactPhone" value="' +
      escapeHtml(team.contactPhone) +
      '"></div></div>' +
      "<label>Squad list</label>" +
      '<table class="squad-table"><thead><tr><th>#</th><th>Player name</th><th>MPL</th><th></th></tr></thead>' +
      '<tbody id="edit-squad-body">' +
      rosterRows +
      "</tbody></table>" +
      '<button type="button" class="link-btn" id="edit-add-player">+ Add player</button>' +
      '<p class="form-note" id="edit-mpl-note"></p>' +
      '<div class="modal-error" id="edit-modal-error"></div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn btn-ghost" id="edit-cancel">Cancel</button>' +
      '<button type="button" class="btn" id="edit-save">Save changes</button>' +
      "</div></div></div>";

    var editBody = document.getElementById("edit-squad-body");
    var editMplNote = document.getElementById("edit-mpl-note");

    function editMplCount() {
      return editBody.querySelectorAll('input[type="checkbox"]:checked').length;
    }

    function updateEditMpl() {
      var c = editMplCount();
      editMplNote.textContent = c + " of " + MAX_MPL + " MPL players selected";
      editMplNote.classList.toggle("warn", c > MAX_MPL);
    }

    function renumberEdit() {
      editBody.querySelectorAll("tr").forEach(function (tr, i) {
        tr.querySelector(".row-num").textContent = String(i + 1);
      });
    }

    function wireEditRow(tr) {
      var cb = tr.querySelector(".mpl-input");
      cb.addEventListener("change", function () {
        if (editMplCount() > MAX_MPL) this.checked = false;
        updateEditMpl();
      });
      tr.querySelector(".remove-player").addEventListener("click", function () {
        if (editBody.querySelectorAll("tr").length <= MIN_PLAYERS) return;
        tr.remove();
        renumberEdit();
        updateEditMpl();
      });
    }

    editBody.querySelectorAll("tr").forEach(wireEditRow);
    updateEditMpl();

    document.getElementById("edit-add-player").addEventListener("click", function () {
      if (editBody.querySelectorAll("tr").length >= MAX_PLAYERS) return;
      var tr = document.createElement("tr");
      var idx = editBody.querySelectorAll("tr").length + 1;
      tr.innerHTML =
        '<td class="row-num">' +
        idx +
        "</td>" +
        '<td><input type="text" class="name-input" placeholder="Player full name"></td>' +
        '<td class="mpl-cell"><input type="checkbox" class="mpl-input" value="Yes"></td>' +
        '<td class="col-remove"><button type="button" class="remove-player link-btn" aria-label="Remove">&times;</button></td>';
      editBody.appendChild(tr);
      wireEditRow(tr);
      updateEditMpl();
    });

    document.getElementById("edit-cancel").addEventListener("click", closeModal);
    document.getElementById("edit-backdrop").addEventListener("click", function (e) {
      if (e.target.id === "edit-backdrop") closeModal();
    });

    document.getElementById("edit-delete-btn").addEventListener("click", async function () {
      var confirmed = window.confirm(
        'Withdraw "' + team.teamName + '" from the Dashain Cup? This cannot be undone.'
      );
      if (!confirmed) return;
      var data = await apiCall(teamApiUrl(team.id, "delete"), { pin: verifiedPin });
      closeModal();
      if (data && data.ok) {
        await loadTeams();
        renderTeams();
      } else {
        window.alert("Could not withdraw the team. Please try again.");
      }
    });

    document.getElementById("edit-save").addEventListener("click", async function () {
      var errBox = document.getElementById("edit-modal-error");
      var newName = document.getElementById("edit-teamName").value.trim();
      var newCaptain = document.getElementById("edit-captainName").value.trim();
      var newContact = document.getElementById("edit-contactPhone").value.trim();
      var newPlayers = collectPlayers(editBody);

      if (!newName || !newCaptain || !newContact) {
        errBox.textContent = "Team name, contact, and phone are required.";
        return;
      }
      if (newPlayers.length < MIN_PLAYERS) {
        errBox.textContent = "You need at least " + MIN_PLAYERS + " players.";
        return;
      }
      if (newPlayers.filter(function (p) { return p.mpl; }).length > MAX_MPL) {
        errBox.textContent = "A squad may include at most 3 current MPL players.";
        return;
      }

      var data = await apiCall(teamApiUrl(team.id, "update"), {
        pin: verifiedPin,
        teamName: newName,
        captainName: newCaptain,
        contactPhone: newContact,
        players: newPlayers,
      });

      if (data && data.ok) {
        closeModal();
        await loadTeams();
        renderTeams();
      } else {
        errBox.textContent = (data && data.message) || "Could not save changes. Please try again.";
      }
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (resultOverlay.classList.contains("is-open")) closeResultPopup();
    else if (modalRoot.innerHTML) closeModal();
  });

  updatePlayerCount();
  updateMplNote();
  loadTeams().then(renderTeams);
})();
