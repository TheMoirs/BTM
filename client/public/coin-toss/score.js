// Score Flip: start screen (Coin Flip / Log Score), match score keeper and per-game timer.
// Everything is kept on this phone (localStorage), so it works offline at the piste.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  var KEY_CURRENT = "ptm-score-current";
  var KEY_HISTORY = "ptm-score-history";
  var KEY_MINUTES = "ptm-score-timer-min";
  var MAX_GAMES = 3;

  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (_) { return fallback; }
  }
  function store(key, value) {
    try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  // ── Screens ─────────────────────────────────────────────────────────────
  var screens = { menu: $("menuScreen"), coin: $("stage"), setup: $("setupScreen"), game: $("gameScreen"), summary: $("summaryScreen") };
  var titles = { menu: "Score Flip", coin: "Coin Flip", setup: "Log Score", game: "Log Score", summary: "Log Score" };
  var current = "menu";
  var pushed = false;

  function show(name) {
    current = name;
    Object.keys(screens).forEach(function (k) { screens[k].hidden = k !== name; });
    $("titleText").textContent = titles[name];
    $("backBtn").hidden = name === "menu";
    if (name === "coin") window.dispatchEvent(new Event("resize")); // repaint the gravel now it has a size
    if (name === "menu") $("goScoreLabel").textContent = match ? "Resume match" : "Log Score";
    if (name !== "game") keepAwake(false);
    else keepAwake(timer.state === "running");
    window.scrollTo(0, 0);
  }
  function open(name) {
    if (!pushed) { history.pushState({ scoreFlip: true }, ""); pushed = true; }
    show(name);
  }
  function goMenu() {
    if (pushed) history.back(); else show("menu");
  }
  window.addEventListener("popstate", function () { pushed = false; show("menu"); });
  $("backBtn").addEventListener("click", goMenu);
  $("goCoin").addEventListener("click", function () { open("coin"); });
  $("goScore").addEventListener("click", function () {
    if (match) { open("game"); renderGame(); } else { openSetup(); }
  });

  // ── Dates and result text ───────────────────────────────────────────────
  function todayIso() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function niceDate(iso, withYear) {
    var p = String(iso || "").split("-");
    var d = p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : new Date();
    var opts = { weekday: "short", day: "numeric", month: "short" };
    if (withYear !== false) opts.year = "numeric";
    return d.toLocaleDateString("en-GB", opts).replace(/,/g, "");
  }
  function gamesWon(games) {
    var w = [0, 0];
    games.forEach(function (g) { if (g[0] > g[1]) w[0]++; else if (g[1] > g[0]) w[1]++; });
    return w;
  }
  function divisionLabel(d) { return d ? "Division " + d : "No division"; }
  function eventLine(m) {
    if (!m.tournament) return "";
    return m.tournament + (m.division != null ? " – " + divisionLabel(m.division) : "");
  }
  function resultText(m) {
    var lines = ["Pétanque – " + niceDate(m.date)];
    if (eventLine(m)) lines.push(eventLine(m));
    lines.push(m.t1 + " v " + m.t2);
    m.games.forEach(function (g, i) { lines.push("Game " + (i + 1) + ": " + g[0] + "–" + g[1]); });
    var w = gamesWon(m.games);
    if (w[0] > w[1]) lines.push(m.t1 + " win " + w[0] + "–" + w[1]);
    else if (w[1] > w[0]) lines.push(m.t2 + " win " + w[1] + "–" + w[0]);
    else lines.push("Drawn " + w[0] + "–" + w[1]);
    return lines.join("\n");
  }

  // ── Match setup ─────────────────────────────────────────────────────────
  var match = load(KEY_CURRENT, null); // { date, t1, t2, games: [[a,b]...], cur: [a,b], timer }

  // Tournaments, divisions and team names come from the server and are kept
  // on the phone, so the lists still work at a piste with no signal.
  var KEY_DATA = "ptm-score-data";     // { tournaments: [{ key, name, divisions: { "A": [names] } }] }
  var KEY_HOME = "ptm-score-home";     // tournament the app was opened / installed from (set in index.html)
  var KEY_LAST = "ptm-score-last";     // { home, tournament, tournamentName (if typed), division, team1 }
  var OTHER = "__other";
  var data = load(KEY_DATA, { tournaments: [] });

  function tournamentByKey(key) {
    for (var i = 0; i < data.tournaments.length; i++) if (data.tournaments[i].key === key) return data.tournaments[i];
    return null;
  }
  function refreshData() {
    if (!window.fetch) return Promise.resolve(false);
    return fetch("/api/public/score-flip", { cache: "no-store" })
      .then(function (res) { if (!res.ok) throw new Error(res.status); return res.json(); })
      .then(function (json) {
        if (!json || !Array.isArray(json.tournaments)) return false;
        data = { tournaments: json.tournaments, fetchedAt: Date.now() };
        store(KEY_DATA, data);
        return true;
      })
      .catch(function () { return false; }); // offline: keep using the copy on the phone
  }

  function fillSelect(sel, items, selected) {
    sel.innerHTML = "";
    items.forEach(function (it) {
      var o = document.createElement("option");
      o.value = it.value; o.textContent = it.label;
      if (it.value === selected) o.selected = true;
      sel.appendChild(o);
    });
  }
  function sortedDivisions(t) {
    return Object.keys(t.divisions || {}).sort(function (a, b) {
      if (!a) return 1; if (!b) return -1; return a.localeCompare(b);
    });
  }
  function homeKey() {
    try { return localStorage.getItem(KEY_HOME); } catch (_) { return null; }
  }
  // The tournament Score Flip was opened / installed from, if its details are on this phone
  function homeTournament() { var k = homeKey(); return k ? tournamentByKey(k) : null; }
  // The tournament picked from the list (null when a name is typed instead)
  function pickedTournament() {
    var sel = $("tournamentSel");
    if (sel.hidden || !sel.value || sel.value === OTHER) return null;
    return tournamentByKey(sel.value);
  }
  function tournamentName() {
    var t = pickedTournament();
    return t ? t.name : $("tournamentName").value.trim();
  }
  function allTeams(t) {
    var seen = {}, out = [];
    Object.keys(t.divisions || {}).forEach(function (d) {
      (t.divisions[d] || []).forEach(function (n) { if (!seen[n]) { seen[n] = 1; out.push(n); } });
    });
    return out.sort(function (a, b) { return a.localeCompare(b); });
  }
  // Teams to offer: the chosen division, or every team in the tournament when no division is chosen
  function currentTeams() {
    var t = pickedTournament();
    if (!t) return null;
    var d = $("divisionSel").value;
    return d === "" ? allTeams(t) : ((t.divisions || {})[d === "-" ? "" : d] || []);
  }

  // The only list choice is the tournament Score Flip was opened from, or "Other" to
  // type a name. With no tournament available, just a box to type one.
  function renderTournamentPicker(want, typed) {
    var sel = $("tournamentSel"), input = $("tournamentName"), note = $("listNote");
    var home = homeTournament();
    if (!home) {
      sel.hidden = true; input.hidden = false;
      if (typed != null) input.value = typed;
      note.hidden = !homeKey(); // opened from a tournament, but its details aren't on this phone yet
      note.textContent = "This phone hasn't saved that tournament's teams yet. Open Score Flip once with a signal to get them. You can type names meanwhile.";
      return;
    }
    note.hidden = true;
    fillSelect(sel, [{ value: home.key, label: home.name }, { value: OTHER, label: "Other (type a name)" }], want === OTHER ? OTHER : home.key);
    sel.hidden = false;
    input.hidden = sel.value !== OTHER;
    input.value = sel.value === OTHER ? (typed || "") : "";
  }
  function renderDivisionPicker(selectedDivision) {
    var t = pickedTournament();
    var dSel = $("divisionSel");
    if (!t) { fillSelect(dSel, [{ value: "", label: "None" }], ""); dSel.disabled = true; return; }
    // "" = no division chosen (all teams); "-" stands for teams with no division
    var items = [{ value: "", label: "None (all teams)" }].concat(sortedDivisions(t).map(function (d) {
      return { value: d || "-", label: divisionLabel(d) };
    }));
    var want = selectedDivision == null ? "" : selectedDivision;
    if (!items.some(function (i) { return i.value === want; })) want = "";
    fillSelect(dSel, items, want);
    dSel.disabled = false;
  }
  function renderTeamPicker(n, wantName) {
    var sel = $("team" + n + "Sel"), input = $("team" + n);
    var teams = currentTeams();
    if (!teams) { // no tournament chosen from the list: type the names
      sel.hidden = true; input.hidden = false;
      if (wantName != null) input.value = wantName;
      return;
    }
    var items = [{ value: "", label: n === 1 ? "Choose team (or Us)" : "Choose team (or Them)" }]
      .concat(teams.map(function (name) { return { value: name, label: name }; }))
      .concat([{ value: OTHER, label: "Other (type a name)" }]);
    var choose = "";
    if (wantName) choose = teams.indexOf(wantName) >= 0 ? wantName : OTHER;
    fillSelect(sel, items, choose);
    sel.hidden = false;
    input.value = choose === OTHER ? wantName : "";
    input.hidden = choose !== OTHER;
  }
  function teamName(n, fallback) {
    var sel = $("team" + n + "Sel"), input = $("team" + n);
    if (!sel.hidden && sel.value && sel.value !== OTHER) return sel.value;
    return input.value.trim() || fallback;
  }
  [1, 2].forEach(function (n) {
    $("team" + n + "Sel").addEventListener("change", function () {
      var other = this.value === OTHER;
      $("team" + n).hidden = !other;
      if (other) { $("team" + n).value = ""; $("team" + n).focus(); }
    });
  });
  $("tournamentSel").addEventListener("change", function () {
    var other = this.value === OTHER;
    $("tournamentName").hidden = !other;
    if (other) { $("tournamentName").value = ""; $("tournamentName").focus(); }
    renderDivisionPicker("");
    renderTeamPicker(1, teamName(1, "")); renderTeamPicker(2, "");
  });
  $("divisionSel").addEventListener("change", function () {
    renderTeamPicker(1, teamName(1, "")); renderTeamPicker(2, "");
  });

  // Defaults: whatever was used last (tournament, division and Team 1, even if typed);
  // otherwise the tournament the app was opened / installed from. Team 2 starts blank.
  function prepareSetup() {
    var home = homeKey();
    var last = load(KEY_LAST, null);
    var want = "", typed = "", division = "", team1 = "";
    if (last && last.home === home) { // opened from a different tournament: start fresh on that one
      want = last.tournament || ""; typed = last.tournamentName || "";
      division = last.division || ""; team1 = last.team1 || "";
    }
    renderTournamentPicker(want, typed);
    renderDivisionPicker(division);
    renderTeamPicker(1, team1);
    renderTeamPicker(2, "");
    $("matchDate").value = todayIso();
  }
  // Redraw after the lists are refreshed, keeping whatever has been chosen or typed
  function redrawKeepingChoices() {
    var sel = $("tournamentSel"), typed = $("tournamentName").value;
    var keep = {
      t: sel.hidden ? (typed.trim() ? OTHER : "") : sel.value,
      typed: typed, d: $("divisionSel").value, t1: teamName(1, ""), t2: teamName(2, ""),
    };
    renderTournamentPicker(keep.t, keep.typed);
    renderDivisionPicker(keep.d);
    renderTeamPicker(1, keep.t1);
    renderTeamPicker(2, keep.t2);
  }

  function openSetup() {
    prepareSetup();
    renderHistory();
    open("setup");
    // Fetch the latest lists (new tournament, new teams), then redraw keeping the choices
    refreshData().then(function (changed) {
      if (changed && current === "setup") redrawKeepingChoices();
    });
  }
  // Save the lists on the phone as soon as the app opens with a signal, so they work offline later
  refreshData().then(function (changed) {
    if (changed && current === "setup") redrawKeepingChoices();
  });
  $("startMatch").addEventListener("click", function () {
    var t = pickedTournament();
    var tName = tournamentName();
    var dValue = $("divisionSel").value;
    var division = t && dValue ? (dValue === "-" ? "" : dValue) : null;
    var t1 = teamName(1, "Us"), t2 = teamName(2, "Them");
    store(KEY_LAST, {
      home: homeKey(),
      tournament: t ? t.key : (tName ? OTHER : ""),
      tournamentName: t ? "" : tName,
      division: dValue && t ? dValue : "",
      team1: t1 === "Us" ? "" : t1,
    });
    match = {
      date: $("matchDate").value || todayIso(),
      tournament: tName,
      division: division,
      t1: t1,
      t2: t2,
      games: [],
      cur: [0, 0],
    };
    resetTimer();
    saveMatch();
    show("game");
    renderGame();
  });

  // ── Scoring ─────────────────────────────────────────────────────────────
  function saveMatch() {
    if (match) match.timer = { state: timer.state, endAt: timer.endAt, remaining: timer.remaining };
    store(KEY_CURRENT, match);
  }
  function renderGame() {
    if (!match) return;
    var n = match.games.length + 1;
    $("gameTitle").textContent = "Game " + n;
    $("gameDate").textContent = niceDate(match.date) + (match.tournament ? " · " + eventLine(match) : "");
    $("name1").textContent = match.t1;
    $("name2").textContent = match.t2;
    $("score1").textContent = match.cur[0];
    $("score2").textContent = match.cur[1];
    $("saveGame").textContent = "Save Game " + n;
    var saved = $("savedGames");
    saved.innerHTML = "";
    match.games.forEach(function (g, i) {
      // Tap a saved game to edit or delete it
      var chip = document.createElement("button");
      chip.type = "button";
      chip.textContent = "G" + (i + 1) + " " + g[0] + "–" + g[1];
      chip.setAttribute("aria-label", "Edit game " + (i + 1));
      chip.addEventListener("click", function () {
        openGamesEditor({
          title: "Edit Game " + (i + 1),
          t1: match.t1, t2: match.t2,
          games: [match.games[i].slice()],
          firstNumber: i + 1,
          onSave: function (games) { match.games[i] = games[0]; saveMatch(); renderGame(); },
          onDelete: function () { match.games.splice(i, 1); saveMatch(); renderGame(); },
        });
      });
      saved.appendChild(chip);
    });
    renderTimer();
  }
  Array.prototype.forEach.call(document.querySelectorAll(".arrow"), function (b) {
    b.addEventListener("click", function () {
      if (!match) return;
      var t = +b.getAttribute("data-team"), step = +b.getAttribute("data-step");
      match.cur[t] = Math.max(0, match.cur[t] + step);
      saveMatch();
      renderGame();
    });
  });

  var toastTimer = null;
  function toast(msg) {
    var el = $("scoreToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "scoreToast";
      el.style.cssText = "position:fixed;left:50%;bottom:max(24px,env(safe-area-inset-bottom));transform:translateX(-50%);background:#0f172a;color:#fff;padding:12px 18px;border-radius:12px;font-weight:600;z-index:20;max-width:90vw;text-align:center";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2500);
  }

  $("saveGame").addEventListener("click", function () {
    if (!match) return;
    if (match.cur[0] === 0 && match.cur[1] === 0) { toast("Enter the scores first"); return; }
    match.games.push(match.cur.slice());
    match.cur = [0, 0];
    resetTimer(); // the timer is per game
    if (match.games.length >= MAX_GAMES) { finishMatch(); return; }
    saveMatch();
    renderGame();
    window.scrollTo(0, 0);
  });

  function endMatchNow() {
    if (match.cur[0] !== 0 || match.cur[1] !== 0) match.games.push(match.cur.slice()); // include the game in progress
    match.cur = [0, 0];
    resetTimer();
    finishMatch();
  }

  $("endMatch").addEventListener("click", function () {
    if (!match) return;
    var inProgress = match.cur[0] !== 0 || match.cur[1] !== 0;
    if (!inProgress && !match.games.length) { toast("No scores to save yet"); return; }
    // The game in progress, or the last saved one if the current game hasn't started
    var last = inProgress ? match.cur : match.games[match.games.length - 1];
    var finished = last.some(function (s) { return s === 9 || s === 13; });
    if (!finished) { $("abandonModal").hidden = false; return; }
    endMatchNow();
  });

  // Abandon: the match is thrown away, not saved to the history
  $("abandonKeep").addEventListener("click", function () { $("abandonModal").hidden = true; });
  $("abandonModal").addEventListener("click", function (e) { if (e.target === $("abandonModal")) $("abandonModal").hidden = true; });
  $("abandonYes").addEventListener("click", function () {
    $("abandonModal").hidden = true;
    resetTimer();
    match = null;
    store(KEY_CURRENT, null);
    goMenu();
    toast("Match abandoned");
  });

  // Tap a big score to type it in
  var scoreTeam = 0;
  [1, 2].forEach(function (n) {
    var el = $("score" + n);
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.setAttribute("aria-label", "Type a score");
    function openScoreBox() {
      if (!match) return;
      scoreTeam = n - 1;
      $("scoreModalTitle").textContent = "Score for " + (n === 1 ? match.t1 : match.t2);
      $("scoreInput").value = match.cur[scoreTeam];
      $("scoreModal").hidden = false;
      // Focus during the tap itself, so the phone opens the number keypad straight away
      var input = $("scoreInput");
      input.focus();
      input.select();
    }
    el.addEventListener("click", openScoreBox);
    el.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openScoreBox(); } });
  });
  function setTypedScore() {
    var v = Math.round(Number($("scoreInput").value));
    if (!isFinite(v) || v < 0 || v > 99) { toast("Enter a score from 0 to 99"); return; }
    $("scoreModal").hidden = true;
    if (!match) return;
    match.cur[scoreTeam] = v;
    saveMatch();
    renderGame();
  }
  $("scoreSet").addEventListener("click", setTypedScore);
  $("scoreInput").addEventListener("keydown", function (e) { if (e.key === "Enter") setTypedScore(); });
  $("scoreCancel").addEventListener("click", function () { $("scoreModal").hidden = true; });
  $("scoreModal").addEventListener("click", function (e) { if (e.target === $("scoreModal")) $("scoreModal").hidden = true; });

  function finishMatch() {
    var record = { id: String(Date.now()), date: match.date, tournament: match.tournament || "", division: match.division == null ? null : match.division, t1: match.t1, t2: match.t2, games: match.games };
    var list = load(KEY_HISTORY, []);
    list.unshift(record);
    store(KEY_HISTORY, list.slice(0, 50));
    match = null;
    store(KEY_CURRENT, null);
    showSummary(record);
  }

  // ── Summary and sharing ─────────────────────────────────────────────────
  var shareTextNow = "";
  function showSummary(record, heading) {
    $("summaryScreen").querySelector("h1").textContent = heading || "Match saved";
    shareTextNow = resultText(record);
    $("summaryText").textContent = shareTextNow;
    $("shareBtn").hidden = !navigator.share;
    $("shareFallback").hidden = !!navigator.share;
    $("whatsappBtn").href = "https://wa.me/?text=" + encodeURIComponent(shareTextNow);
    $("shareNote").hidden = true;
    if (current === "menu") open("summary"); else show("summary");
  }
  $("shareBtn").addEventListener("click", function () {
    navigator.share({ title: "Pétanque result", text: shareTextNow }).catch(function (err) {
      if (err && err.name === "AbortError") return; // they closed the share sheet
      $("shareFallback").hidden = false;
    });
  });
  $("copyBtn").addEventListener("click", function () {
    var done = function () { $("shareNote").textContent = "Copied – paste it into a message"; $("shareNote").hidden = false; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareTextNow).then(done, function () { legacyCopy(); done(); });
    } else { legacyCopy(); done(); }
  });
  function legacyCopy() {
    var ta = document.createElement("textarea");
    ta.value = shareTextNow; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (_) {}
    ta.remove();
  }
  $("newMatch").addEventListener("click", function () {
    prepareSetup();
    renderHistory();
    show("setup");
  });

  // Number fields in the boxes: tapping one selects the whole number (typing replaces it)
  // and scrolls it into view above the keypad
  function selectNumber(inp) {
    setTimeout(function () {
      try { inp.select(); } catch (_) {}
      if (inp.scrollIntoView) inp.scrollIntoView({ block: "nearest" });
    }, 0);
  }
  document.addEventListener("focusin", function (e) {
    var t = e.target;
    if (t && t.tagName === "INPUT" && t.type === "number" && t.closest(".modal")) selectNumber(t);
  });
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t && t.tagName === "INPUT" && t.type === "number" && t.closest(".modal")) selectNumber(t);
  });
  // Once the keypad has opened (the page shrinks to fit), keep the field being typed in visible
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", function () {
      var a = document.activeElement;
      if (a && a.tagName === "INPUT" && a.closest(".modal") && a.scrollIntoView) a.scrollIntoView({ block: "nearest" });
    });
  }

  // ── Edit saved games (a game in the current match, or a previous match) ──
  var gamesEdit = null;
  function openGamesEditor(opts) {
    gamesEdit = opts;
    $("gamesModalTitle").textContent = opts.title;
    var box = $("gamesRows");
    box.innerHTML = "";
    var head = document.createElement("div");
    head.className = "g-row g-head";
    ["", opts.t1, opts.t2].forEach(function (t) {
      var sp = document.createElement("span");
      sp.textContent = t;
      head.appendChild(sp);
    });
    box.appendChild(head);
    opts.games.forEach(function (g, i) {
      var row = document.createElement("div");
      row.className = "g-row";
      var label = document.createElement("span");
      label.textContent = "Game " + (opts.firstNumber + i);
      row.appendChild(label);
      [0, 1].forEach(function (k) {
        var inp = document.createElement("input");
        inp.type = "number"; inp.min = "0"; inp.max = "99";
        inp.setAttribute("inputmode", "numeric");
        inp.value = g[k];
        inp.setAttribute("aria-label", "Game " + (opts.firstNumber + i) + " " + (k === 0 ? opts.t1 : opts.t2));
        row.appendChild(inp);
      });
      box.appendChild(row);
    });
    var del = $("gamesDelete");
    del.hidden = !opts.onDelete;
    del.textContent = "Delete game";
    $("gamesModal").hidden = false;
    // Focus during the tap, so the number keypad opens straight away
    var first = box.querySelector("input");
    if (first) { first.focus(); first.select(); }
  }
  function closeGamesEditor() { $("gamesModal").hidden = true; gamesEdit = null; }
  $("gamesSave").addEventListener("click", function () {
    if (!gamesEdit) return;
    var inputs = $("gamesRows").querySelectorAll("input");
    var games = [];
    for (var i = 0; i < inputs.length; i += 2) {
      var a = inputs[i].value === "" ? NaN : Math.round(Number(inputs[i].value));
      var b = inputs[i + 1].value === "" ? NaN : Math.round(Number(inputs[i + 1].value));
      if (!isFinite(a) || !isFinite(b) || a < 0 || b < 0 || a > 99 || b > 99) { toast("Scores must be 0 to 99"); return; }
      games.push([a, b]);
    }
    var done = gamesEdit.onSave;
    closeGamesEditor();
    done(games);
  });
  $("gamesDelete").addEventListener("click", function () {
    if (!gamesEdit || !gamesEdit.onDelete) return;
    var del = $("gamesDelete");
    if (del.textContent !== "Sure?") { del.textContent = "Sure?"; return; }
    var done = gamesEdit.onDelete;
    closeGamesEditor();
    done();
  });
  $("gamesCancel").addEventListener("click", closeGamesEditor);
  $("gamesModal").addEventListener("click", function (e) { if (e.target === $("gamesModal")) closeGamesEditor(); });

  // ── Previous matches ────────────────────────────────────────────────────
  function renderHistory() {
    var list = load(KEY_HISTORY, []);
    var ul = $("historyList");
    ul.innerHTML = "";
    $("historyBox").hidden = list.length === 0;
    list.forEach(function (m) {
      var li = document.createElement("li");
      var text = document.createElement("div");
      text.className = "h-text";
      var title = document.createElement("strong");
      title.textContent = m.t1 + " v " + m.t2;
      var detail = document.createElement("span");
      detail.textContent = niceDate(m.date, false) + (m.tournament ? " · " + eventLine(m) : "") + " · " + m.games.map(function (g) { return g[0] + "–" + g[1]; }).join(", ");
      text.appendChild(title); text.appendChild(detail);

      var share = document.createElement("button");
      share.type = "button"; share.textContent = "Share";
      share.addEventListener("click", function () { showSummary(m, "Match result"); });

      var del = document.createElement("button");
      del.type = "button"; del.textContent = "Delete";
      del.addEventListener("click", function () {
        if (del.textContent !== "Sure?") { del.textContent = "Sure?"; return; }
        store(KEY_HISTORY, load(KEY_HISTORY, []).filter(function (x) { return x.id !== m.id; }));
        renderHistory();
      });

      var edit = document.createElement("button");
      edit.type = "button"; edit.textContent = "Edit";
      edit.addEventListener("click", function () {
        openGamesEditor({
          title: "Edit match",
          t1: m.t1, t2: m.t2,
          games: m.games.map(function (g) { return g.slice(); }),
          firstNumber: 1,
          onSave: function (games) {
            var list = load(KEY_HISTORY, []);
            list.forEach(function (x) { if (x.id === m.id) x.games = games; });
            store(KEY_HISTORY, list);
            renderHistory();
          },
        });
      });

      li.appendChild(text); li.appendChild(edit); li.appendChild(share); li.appendChild(del);
      ul.appendChild(li);
    });
  }

  // ── Timer (per game) ────────────────────────────────────────────────────
  function minutes() {
    var m = Number(load(KEY_MINUTES, 30));
    return m >= 1 && m <= 180 ? m : 30;
  }
  var timer = { state: "idle", endAt: 0, remaining: minutes() * 60000, ringing: false };
  var tickHandle = null;

  function fmt(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var m = Math.floor(s / 60);
    return m + ":" + String(s % 60).padStart(2, "0");
  }
  function left() { return timer.state === "running" ? timer.endAt - Date.now() : timer.remaining; }

  function renderTimer() {
    var ms = left();
    $("timerTime").textContent = fmt(ms);
    $("timerTime").disabled = timer.state !== "idle";
    var start = $("timerStart");
    start.hidden = timer.state === "done";
    start.textContent = timer.state === "running" ? "Pause" : timer.state === "paused" ? "Resume" : "Start";
    start.classList.toggle("go", timer.state !== "running");
    $("timerReset").hidden = timer.state === "idle" || timer.ringing;
    $("timerStop").hidden = !timer.ringing;
    $("timerHint").textContent =
      timer.state === "idle" ? "Tap the time to change it" :
      timer.state === "done" ? (timer.ringing ? "Time's up!" : "Time's up") :
      timer.state === "paused" ? "Paused" : "Time left in this game";
    $("timerBox").classList.toggle("ringing", timer.ringing);
    $("timerBox").classList.toggle("low", timer.state === "running" && ms <= 60000);
  }

  function tick() {
    if (timer.state === "running" && left() <= 0) {
      timer.state = "done"; timer.remaining = 0;
      stopTicking();
      keepAwake(false);
      ring(true);
      saveMatch();
    }
    renderTimer();
  }
  function startTicking() { stopTicking(); tickHandle = setInterval(tick, 250); }
  function stopTicking() { if (tickHandle) { clearInterval(tickHandle); tickHandle = null; } }

  $("timerStart").addEventListener("click", function () {
    unlockAudio();
    if (timer.state === "running") {
      timer.remaining = left(); timer.state = "paused"; stopTicking(); keepAwake(false);
    } else {
      if (timer.state === "idle") timer.remaining = minutes() * 60000;
      timer.endAt = Date.now() + timer.remaining; timer.state = "running"; startTicking(); keepAwake(true);
    }
    saveMatch();
    renderTimer();
  });
  $("timerReset").addEventListener("click", function () { resetTimer(); saveMatch(); renderTimer(); });
  $("timerStop").addEventListener("click", function () { ring(false); renderTimer(); });

  function resetTimer() {
    ring(false);
    stopTicking();
    keepAwake(false);
    timer.state = "idle"; timer.endAt = 0; timer.remaining = minutes() * 60000;
  }

  // Change the timer length
  $("timerTime").addEventListener("click", function () {
    if (timer.state !== "idle") return;
    $("timerMinutes").value = minutes();
    $("timerModal").hidden = false;
    setTimeout(function () { $("timerMinutes").select(); }, 50);
  });
  $("timerCancel").addEventListener("click", function () { $("timerModal").hidden = true; });
  $("timerSave").addEventListener("click", function () {
    var m = Math.round(Number($("timerMinutes").value));
    if (!(m >= 1 && m <= 180)) { toast("Choose between 1 and 180 minutes"); return; }
    store(KEY_MINUTES, m);
    $("timerModal").hidden = true;
    if (timer.state === "idle") timer.remaining = m * 60000;
    renderTimer();
  });
  $("timerModal").addEventListener("click", function (e) { if (e.target === $("timerModal")) $("timerModal").hidden = true; });

  // ── Alarm sound and vibration ───────────────────────────────────────────
  var audio = null, ringHandle = null;
  function unlockAudio() {
    // Phones only allow sound after a tap, so set it up when Start is pressed
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
    } catch (_) {}
  }
  function beep(at, freq, len) {
    var osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.9, at + 0.01);
    gain.gain.setValueAtTime(0.9, at + len - 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + len);
    osc.connect(gain); gain.connect(audio.destination);
    osc.start(at); osc.stop(at + len + 0.02);
  }
  function ringOnce() {
    if (audio) {
      try {
        if (audio.state === "suspended") audio.resume();
        var t = audio.currentTime + 0.02;
        for (var i = 0; i < 4; i++) { beep(t + i * 0.22, i % 2 ? 1320 : 1760, 0.16); }
      } catch (_) {}
    }
    if (navigator.vibrate) { try { navigator.vibrate([300, 120, 300, 120, 300]); } catch (_) {} }
  }
  function ring(on) {
    timer.ringing = !!on;
    if (ringHandle) { clearInterval(ringHandle); ringHandle = null; }
    if (on) { ringOnce(); ringHandle = setInterval(ringOnce, 1300); }
    else if (navigator.vibrate) { try { navigator.vibrate(0); } catch (_) {} }
  }

  // ── Keep the screen on while the timer runs ─────────────────────────────
  var wakeLock = null, wantAwake = false;
  function keepAwake(on) {
    wantAwake = on;
    if (!("wakeLock" in navigator)) return;
    if (on && !wakeLock) {
      navigator.wakeLock.request("screen").then(function (l) {
        wakeLock = l;
        l.addEventListener("release", function () { wakeLock = null; });
        if (!wantAwake) { l.release(); }
      }).catch(function () {});
    } else if (!on && wakeLock) {
      wakeLock.release().catch(function () {});
      wakeLock = null;
    }
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    if (audio && audio.state === "suspended") { try { audio.resume(); } catch (_) {} }
    if (wantAwake && !wakeLock) keepAwake(true);
    tick(); // the time kept running while away; ring now if it ran out
  });

  // ── Start up ────────────────────────────────────────────────────────────
  if (match && match.timer) {
    timer.state = match.timer.state || "idle";
    timer.endAt = match.timer.endAt || 0;
    timer.remaining = match.timer.remaining != null ? match.timer.remaining : minutes() * 60000;
    if (timer.state === "running") startTicking();
    if (timer.state === "done") timer.ringing = false;
  }
  show("menu");
  refreshData();
})();
