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
  function resultText(m) {
    var lines = ["Pétanque – " + niceDate(m.date), m.t1 + " v " + m.t2];
    m.games.forEach(function (g, i) { lines.push("Game " + (i + 1) + ": " + g[0] + "–" + g[1]); });
    var w = gamesWon(m.games);
    if (w[0] > w[1]) lines.push(m.t1 + " win " + w[0] + "–" + w[1]);
    else if (w[1] > w[0]) lines.push(m.t2 + " win " + w[1] + "–" + w[0]);
    else lines.push("Drawn " + w[0] + "–" + w[1]);
    return lines.join("\n");
  }

  // ── Match setup ─────────────────────────────────────────────────────────
  var match = load(KEY_CURRENT, null); // { date, t1, t2, games: [[a,b]...], cur: [a,b], timer }

  function openSetup() {
    $("matchDate").value = todayIso();
    $("team1").value = "";
    $("team2").value = "";
    renderHistory();
    open("setup");
  }
  $("startMatch").addEventListener("click", function () {
    match = {
      date: $("matchDate").value || todayIso(),
      t1: $("team1").value.trim() || "Us",
      t2: $("team2").value.trim() || "Them",
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
    $("gameDate").textContent = niceDate(match.date);
    $("name1").textContent = match.t1;
    $("name2").textContent = match.t2;
    $("score1").textContent = match.cur[0];
    $("score2").textContent = match.cur[1];
    $("saveGame").textContent = "Save Game " + n;
    var saved = $("savedGames");
    saved.innerHTML = "";
    match.games.forEach(function (g, i) {
      var chip = document.createElement("span");
      chip.textContent = "G" + (i + 1) + " " + g[0] + "–" + g[1];
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

  $("endMatch").addEventListener("click", function () {
    if (!match) return;
    if (match.cur[0] !== 0 || match.cur[1] !== 0) match.games.push(match.cur.slice()); // include the game in progress
    match.cur = [0, 0];
    if (!match.games.length) { toast("No scores to save yet"); return; }
    resetTimer();
    finishMatch();
  });

  function finishMatch() {
    var record = { id: String(Date.now()), date: match.date, t1: match.t1, t2: match.t2, games: match.games };
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
    $("matchDate").value = todayIso();
    $("team1").value = "";
    $("team2").value = "";
    renderHistory();
    show("setup");
  });

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
      detail.textContent = niceDate(m.date, false) + " · " + m.games.map(function (g) { return g[0] + "–" + g[1]; }).join(", ");
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

      li.appendChild(text); li.appendChild(share); li.appendChild(del);
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
})();
