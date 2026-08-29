/* =====================================================
   Gurkhali FC — Dashain Cup Team Registration
   Squad registration UI, public teams list, PIN manage,
   and Django API + result popup wiring.
   ===================================================== */

(function () {
  "use strict";

  var MIN_PLAYERS = 7;
  var MAX_PLAYERS = 12;
  var playerIdSeq = 0;
  var allTeams = [];

  var form = document.getElementById("team-form");
  if (!form) return;

  var playersContainer = document.getElementById("players-container");
  var addPlayerBtn = document.getElementById("add-player-btn");
  var playerCountLabel = document.getElementById("player-count-label");
  var playersError = document.getElementById("players-error");
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
    // /api/teams/ → /api/teams/<id>/<action>/
    var base = teamsUrl.replace(/\/?$/, "/");
    return base + teamId + "/" + action + "/";
  }

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

  function addPlayerRow(prefillName, prefillJersey) {
    var rows = playersContainer.querySelectorAll(".player-row");
    if (rows.length >= MAX_PLAYERS) return;
    playerIdSeq++;
    var row = document.createElement("div");
    row.className = "player-row";
    row.dataset.id = "p" + playerIdSeq;
    var idx = rows.length + 1;
    row.innerHTML =
      '<div class="num">' +
      idx +
      "</div>" +
      '<input type="text" class="name-input" placeholder="Player full name" autocomplete="off" value="' +
      (prefillName ? escapeHtml(prefillName) : "") +
      '">' +
      '<input type="text" class="jersey-input" placeholder="No." maxlength="3" value="' +
      (prefillJersey ? escapeHtml(prefillJersey) : "") +
      '">' +
      '<button type="button" class="remove-player" aria-label="Remove player">&times;</button>';
    playersContainer.appendChild(row);
    row.querySelector(".remove-player").addEventListener("click", function () {
      row.remove();
      renumberRows();
      updatePlayerCount();
    });
    updatePlayerCount();
  }

  function renumberRows() {
    playersContainer.querySelectorAll(".player-row").forEach(function (r, i) {
      r.querySelector(".num").textContent = i + 1;
    });
  }

  function updatePlayerCount() {
    var n = playersContainer.querySelectorAll(".player-row").length;
    playerCountLabel.textContent = n;
    addPlayerBtn.disabled = n >= MAX_PLAYERS;
  }

  addPlayerBtn.addEventListener("click", function () {
    addPlayerRow();
  });
  for (var i = 0; i < 7; i++) addPlayerRow();

  function openRulesModal() {
    var tpl = document.getElementById("rules-content-template");
    modalRoot.innerHTML =
      '<div class="modal-backdrop" id="rules-backdrop">' +
      '<div class="modal-box rules-modal-box">' +
      "<h3>Dashain Cup — Rules & Agreement</h3>" +
      '<div id="rules-body"></div>' +
      '<div class="rules-modal-close-row"><button type="button" class="btn-go" id="rules-close-btn">Close</button></div>' +
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
    formMsg.className = "form-msg";
    formMsg.style.display = "none";
  }

  function setFieldError(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add("err");
  }

  function collectPlayers(container) {
    var players = [];
    Array.prototype.slice.call(container.querySelectorAll(".player-row")).forEach(function (r) {
      var name = r.querySelector(".name-input").value.trim();
      var jersey = r.querySelector(".jersey-input").value.trim();
      if (name) players.push({ name: name, jersey: jersey || null });
    });
    return players;
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
    var players = collectPlayers(playersContainer);

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
    if (!valid) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Registering…";

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
        playersContainer.innerHTML = "";
        for (var i = 0; i < 7; i++) addPlayerRow();
        await loadTeams();
        renderTeams();
        showResultPopup(
          "success",
          "Registration Successful!",
          result.message ||
            "Thanks, <strong>" +
              escapeHtml(teamName) +
              "</strong>! Your squad is on the list. Keep your PIN safe."
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
      submitBtn.textContent = "Register team";
    }
  });

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

  function updateStats() {
    document.getElementById("stat-teams").textContent = allTeams.length;
    var totalPlayers = allTeams.reduce(function (sum, t) {
      return sum + (t.players ? t.players.length : 0);
    }, 0);
    document.getElementById("stat-players").textContent = totalPlayers;
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
    document.getElementById("stat-latest").textContent = latestLabel;
  }

  function renderTeams() {
    updateStats();
    var region = document.getElementById("teams-list-region");
    var query = (document.getElementById("search-teams").value || "").toLowerCase().trim();

    var filtered = allTeams.filter(function (t) {
      if (!query) return true;
      return (
        t.teamName.toLowerCase().indexOf(query) !== -1 ||
        t.captainName.toLowerCase().indexOf(query) !== -1
      );
    });

    if (!allTeams.length) {
      region.innerHTML =
        '<div class="teams-empty"><div class="big">No teams yet</div>Be the first to register your squad for the Dashain Cup.</div>';
      return;
    }
    if (!filtered.length) {
      region.innerHTML =
        '<div class="teams-empty"><div class="big">No matches</div>Try a different team or captain name.</div>';
      return;
    }

    var sorted = filtered.slice().sort(function (a, b) {
      return new Date(b.registeredAt) - new Date(a.registeredAt);
    });

    var html = '<div class="team-list">';
    sorted.forEach(function (t) {
      var rosterHtml = (t.players || [])
        .map(function (p) {
          return (
            '<div class="roster-item"><span class="jn">' +
            (p.jersey ? escapeHtml(p.jersey) : "–") +
            "</span>" +
            escapeHtml(p.name) +
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
        '<div class="tn">' +
        escapeHtml(t.teamName) +
        "</div>" +
        '<div class="cap">Captain: ' +
        escapeHtml(t.captainName) +
        "</div>" +
        "</div></div>" +
        '<div class="team-card-right">' +
        '<span class="roster-count">' +
        (t.players ? t.players.length : 0) +
        " players</span>" +
        '<button type="button" class="manage-btn" data-team-id="' +
        escapeHtml(t.id) +
        '">Manage</button>' +
        '<span class="chevron">&#9662;</span>' +
        "</div></div>" +
        '<div class="team-card-body"><div class="team-card-body-inner">' +
        '<div class="contact-line">Contact: ' +
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

  document.getElementById("search-teams").addEventListener("input", renderTeams);

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
      '<div class="modal-box">' +
      "<h3>Manage &quot;" +
      escapeHtml(team.teamName) +
      "&quot;</h3>" +
      "<p>Enter the 4-digit PIN this team set at registration. Only the captain who registered this team can edit or withdraw it.</p>" +
      '<input type="password" id="pin-input" inputmode="numeric" maxlength="4" placeholder="PIN">' +
      '<div class="modal-error" id="pin-modal-error"></div>' +
      '<div class="modal-actions">' +
      '<button type="button" id="pin-cancel">Cancel</button>' +
      '<button type="button" class="btn-go" id="pin-confirm">Unlock</button>' +
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

    var rosterHtml = (team.players || [])
      .map(function (p, i) {
        return (
          '<div class="player-row" data-edit-row="1">' +
          '<div class="num">' +
          (i + 1) +
          "</div>" +
          '<input type="text" class="name-input" value="' +
          escapeHtml(p.name) +
          '" placeholder="Player full name">' +
          '<input type="text" class="jersey-input" value="' +
          (p.jersey ? escapeHtml(p.jersey) : "") +
          '" placeholder="No." maxlength="3">' +
          '<button type="button" class="remove-player" aria-label="Remove player">&times;</button>' +
          "</div>"
        );
      })
      .join("");

    modalRoot.innerHTML =
      '<div class="modal-backdrop" id="edit-backdrop">' +
      '<div class="modal-box" style="max-width:560px;max-height:88vh;overflow:auto;">' +
      '<div class="edit-toolbar">' +
      '<h3 style="margin:0;">Edit &quot;' +
      escapeHtml(team.teamName) +
      '&quot;</h3>' +
      '<button type="button" class="btn-delete" id="edit-delete-btn">Withdraw team</button>' +
      "</div>" +
      "<p>Only your club can make these changes. Update details below and save.</p>" +
      '<label class="hint" style="display:block;margin-bottom:4px;">Team name</label>' +
      '<input type="text" id="edit-teamName" value="' +
      escapeHtml(team.teamName) +
      '">' +
      '<label class="hint" style="display:block;margin:10px 0 4px;">Captain name</label>' +
      '<input type="text" id="edit-captainName" value="' +
      escapeHtml(team.captainName) +
      '">' +
      '<label class="hint" style="display:block;margin:10px 0 4px;">Contact number</label>' +
      '<input type="text" id="edit-contactPhone" value="' +
      escapeHtml(team.contactPhone) +
      '">' +
      '<label class="hint" style="display:block;margin:14px 0 6px;font-weight:700;color:var(--ink);">Squad list</label>' +
      '<div id="edit-players-container">' +
      rosterHtml +
      "</div>" +
      '<button type="button" class="add-player-btn" id="edit-add-player">+ Add player</button>' +
      '<div class="modal-error" id="edit-modal-error"></div>' +
      '<div class="modal-actions">' +
      '<button type="button" id="edit-cancel">Cancel</button>' +
      '<button type="button" class="btn-go" id="edit-save">Save changes</button>' +
      "</div></div></div>";

    var editContainer = document.getElementById("edit-players-container");

    function wireRemove(btn) {
      btn.addEventListener("click", function () {
        btn.closest(".player-row").remove();
        editContainer.querySelectorAll(".player-row").forEach(function (r, i) {
          r.querySelector(".num").textContent = i + 1;
        });
      });
    }

    editContainer.querySelectorAll(".remove-player").forEach(wireRemove);

    document.getElementById("edit-add-player").addEventListener("click", function () {
      var rows = editContainer.querySelectorAll(".player-row");
      if (rows.length >= MAX_PLAYERS) return;
      var row = document.createElement("div");
      row.className = "player-row";
      row.innerHTML =
        '<div class="num">' +
        (rows.length + 1) +
        "</div>" +
        '<input type="text" class="name-input" placeholder="Player full name">' +
        '<input type="text" class="jersey-input" placeholder="No." maxlength="3">' +
        '<button type="button" class="remove-player" aria-label="Remove player">&times;</button>';
      editContainer.appendChild(row);
      wireRemove(row.querySelector(".remove-player"));
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
      var newPlayers = collectPlayers(editContainer);

      if (!newName || !newCaptain || !newContact) {
        errBox.textContent = "Team name, captain, and contact are required.";
        return;
      }
      if (newPlayers.length < MIN_PLAYERS) {
        errBox.textContent = "You need at least " + MIN_PLAYERS + " players.";
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
  loadTeams().then(renderTeams);
})();
