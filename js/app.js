/* Johnny K's Content Hub — single-page app. No build step, no server. */
(function () {
  "use strict";
  var D = window.JKPS_DATA, C = window.JKPS_CONFIG || {};
  var app = document.getElementById("app");
  if (!D) { app.innerHTML = '<div class="empty card"><h2>Content data missing</h2><p>The file <code>data/content.js</code> was not found. Use <a href="update.html">update.html</a> to create it from the Excel workbook, then upload it to the <code>data</code> folder.</p></div>'; return; }

  /* ---------------- helpers ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function uniq(a) { return a.filter(function (v, i) { return v && a.indexOf(v) === i; }); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function fmtNum(n) { return Math.round(n).toLocaleString("en-US"); }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function parseDate(s) { if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null; var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtDate(s) { var d = parseDate(s); return d ? MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear() : (s || ""); }
  function fmtShort(s) { var d = parseDate(s); return d ? MONTHS[d.getMonth()] + " " + d.getDate() : (s || ""); }
  function toast(msg) { var t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("show"); }, 2200); }
  function copyText(text, msg) {
    function fallback() { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); toast(msg || "Copied"); }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg || "Copied"); }, fallback); else fallback();
  }
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("jkps:" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("jkps:" + k, JSON.stringify(v)); } catch (e) {} }
  };

  /* ---------------- data prep ---------------- */
  var S = D.settings || {};
  var STORES = (S.lists && S.lists.Showrooms ? S.lists.Showrooms : ["Niles", "Elyria", "Lodi", "Bedford", "Universal"]).filter(function (s) { return s !== "Universal"; });
  var ideas = D.ideas;
  var byId = {}; ideas.forEach(function (i) { byId[i.ID] = i; });
  var PROD_ORDER = (S.lists && S.lists.ProdStatus) || ["Idea", "Approved", "Talent Scheduled", "Filmed", "Editing", "In Review", "Ready to Post", "Posted", "On Hold", "Dropped"];

  function availability(i) {
    var st = i["Production Status"] || "Idea";
    if (st === "Dropped") return { key: "dropped", label: "Dropped", cls: "b-hold" };
    if (st === "On Hold") return { key: "hold", label: "On hold", cls: "b-hold" };
    if (st === "Posted") return { key: "posted", label: "Posted", cls: "b-posted" };
    if (["Filmed", "Editing", "In Review", "Ready to Post"].indexOf(st) >= 0) return { key: "prod", label: st, cls: "b-prod" };
    if (st === "Talent Scheduled" || (i["Scheduled Talent"] && i["Scheduled Talent"] !== "No")) return { key: "claimed", label: "Talent scheduled", cls: "b-claimed" };
    return { key: "open", label: "Open to record", cls: "b-open" };
  }
  function fitsStore(i, s) {
    if (!s) return true;
    if (i.Showroom === s) return true;
    return i.Scope === "Universal" && (i["Compatible Showrooms"] || "").indexOf(s) >= 0;
  }
  function storeLabel(i) { return i.Scope === "Universal" ? "Company-wide" : i.Showroom; }
  var SUGGEST = window.JKPS_SUGGEST || {};
  function suggested(i) {
    if (i["Suggested Showroom"]) return i["Suggested Showroom"];
    if (i.Scope !== "Universal") return i.Showroom;
    if (SUGGEST[i.ID]) return SUGGEST[i.ID][0];
    return (i["Compatible Showrooms"] || "").split(/,\s*/)[0] || "Any store";
  }
  function suggestWhy(i) { return i.Scope === "Universal" && !i["Suggested Showroom"] && SUGGEST[i.ID] ? SUGGEST[i.ID][1] : ""; }

  /* ---------------- owner mode (passcode screen, not real security) ---------------- */
  function sha256(str) {
    function rr(n, x) { return (x >>> n) | (x << (32 - n)); }
    var K = [], H = [], p = 0, c = 2;
    while (p < 64) { var ok = true; for (var d = 2; d * d <= c; d++) if (c % d === 0) { ok = false; break; } if (ok) { if (p < 8) H[p] = (Math.pow(c, 1 / 2) * 4294967296) | 0; K[p++] = (Math.pow(c, 1 / 3) * 4294967296) | 0; } c++; }
    var bytes = unescape(encodeURIComponent(str)), l = bytes.length, w = [], i;
    for (i = 0; i < l; i++) w[i >> 2] |= bytes.charCodeAt(i) << (24 - (i % 4) * 8);
    w[l >> 2] |= 0x80 << (24 - (l % 4) * 8); w[(((l + 8) >> 6) << 4) + 15] = l * 8;
    for (var j = 0; j < w.length; j += 16) {
      var a = H.slice(0), W = [];
      for (i = 0; i < 64; i++) {
        if (i < 16) W[i] = w[j + i] | 0;
        else { var s0 = rr(7, W[i - 15]) ^ rr(18, W[i - 15]) ^ (W[i - 15] >>> 3), s1 = rr(17, W[i - 2]) ^ rr(19, W[i - 2]) ^ (W[i - 2] >>> 10); W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0; }
        var t1 = (a[7] + (rr(6, a[4]) ^ rr(11, a[4]) ^ rr(25, a[4])) + ((a[4] & a[5]) ^ (~a[4] & a[6])) + K[i] + W[i]) | 0;
        var t2 = ((rr(2, a[0]) ^ rr(13, a[0]) ^ rr(22, a[0])) + ((a[0] & a[1]) ^ (a[0] & a[2]) ^ (a[1] & a[2]))) | 0;
        a = [(t1 + t2) | 0].concat(a.slice(0, 7)); a[4] = (a[4] + t1) | 0;
      }
      for (i = 0; i < 8; i++) H[i] = (H[i] + a[i]) | 0;
    }
    return H.map(function (h) { return ("00000000" + (h >>> 0).toString(16)).slice(-8); }).join("");
  }
  function hashPass(p) { return sha256("jkps-owner:" + p); }
  function isOwner() { var t = store.get("owner", ""); return !!t && (C.ownerPasscodeHash ? t === C.ownerPasscodeHash : t.indexOf("pending:") === 0); }
  function applyOwner() { $$(".owner-only").forEach(function (el) { el.hidden = !isOwner(); }); var ol = $("#ownerLink"); if (ol) ol.textContent = isOwner() ? "Owner ✓" : "Owner"; }

  /* ---------------- email helper ---------------- */
  function sendEmail(subject, body, afterHtml) {
    if (!C.contactEmail) { copyText("Subject: " + subject + "\n\n" + body, "Copied. Paste it into an email or text"); return; }
    var href = "mailto:" + encodeURIComponent(C.contactEmail) + "?subject=" + encodeURIComponent(subject) + (C.ccEmail ? "&cc=" + encodeURIComponent(C.ccEmail) : "") + "&body=" + encodeURIComponent(body);
    window.location.href = href;
    setTimeout(function () {
      $("#modalBody").innerHTML = '<div class="eyebrow">Almost done</div><h2>Check your email app</h2><p>' + (afterHtml || "Your message") + ' should be open in a new email. Press <strong>Send</strong>. If nothing opened, copy it instead and send it to ' + esc(C.contactEmail) + '.</p><button class="btn" id="mailCopy">Copy text</button>';
      $("#mailCopy").onclick = function () { copyText("To: " + C.contactEmail + "\nSubject: " + subject + "\n\n" + body, "Copied"); };
    }, 400);
  }
  function noEmailNote() {
    return C.contactEmail ? '<p class="muted small">This opens your email app with everything filled in for ' + esc(C.contactName || "the marketing team") + '. Just press Send.</p>'
      : '<p class="callout small">No contact email is set up for this site yet. Use “Copy text” and send it to ' + esc(C.contactName || "the marketing team") + ' directly.</p>';
  }
  function storeInfo(name) { return (S.stores || []).filter(function (s) { return s.Showroom === name; })[0]; }

  /* ---------------- picks (shortlist) ---------------- */
  var picks = store.get("picks", []).filter(function (id) { return byId[id]; });
  function savePicks() { store.set("picks", picks); $("#picksCount").textContent = picks.length; }
  function togglePick(id) {
    var k = picks.indexOf(id);
    if (k >= 0) { picks.splice(k, 1); toast("Removed from My Picks"); } else { picks.push(id); toast("Added to My Picks"); }
    savePicks();
    $$('[data-pick="' + id + '"]').forEach(function (b) { setPickBtn(b, id); });
  }
  function setPickBtn(b, id) { var on = picks.indexOf(id) >= 0; b.classList.toggle("on", on); b.textContent = on ? "★ Picked" : "☆ Pick"; b.setAttribute("aria-pressed", on); }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-pick]");
    if (b) { e.preventDefault(); e.stopPropagation(); togglePick(b.getAttribute("data-pick")); }
  });

  /* ---------------- modal ---------------- */
  var modal = $("#modal");
  function openModal(html) { $("#modalBody").innerHTML = html; modal.hidden = false; var f = $("input,select,textarea,button", $("#modalBody")); if (f) f.focus(); }
  function closeModal() { modal.hidden = true; }
  $("#modalClose").onclick = closeModal;
  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) closeModal(); });

  /* ---------------- request by email ---------------- */
  var STORE_OPTS = ["", "Niles", "Elyria", "Lodi", "Bedford"];
  function storeSelect(name, sel) { return '<select class="f" name="' + name + '">' + STORE_OPTS.map(function (s) { return '<option' + (sel === s ? " selected" : "") + ' value="' + esc(s) + '">' + (s || "Choose…") + "</option>"; }).join("") + "</select>"; }
  function requestModal(ids) {
    var list = ids.map(function (id) { return byId[id]; }).filter(Boolean);
    if (!list.length) return;
    var me = store.get("me", {});
    var cam = list.length === 1 ? (store.get("cam", {})[list[0].ID] || "") : "";
    openModal(
      '<div class="eyebrow">Request to record</div><h2 id="modalTitle">' + (list.length === 1 ? esc(list[0].Title) : list.length + " ideas") + '</h2>' +
      '<p class="muted small">' + list.map(function (i) { return esc(i.ID); }).join(", ") + '</p>' +
      '<form class="form-grid" id="reqForm">' +
      '<label>Your name<input class="f" name="name" required value="' + esc(me.name || "") + '"></label>' +
      '<label>Who\'s on camera<input class="f" name="cam" placeholder="Names of everyone who\'ll be in the video" value="' + esc(cam || me.name || "") + '"></label>' +
      '<label>Your role / department<input class="f" name="role" placeholder="e.g. Parts counter, Service tech" value="' + esc(me.role || "") + '"></label>' +
      '<label>Your showroom' + storeSelect("store", me.store) + '</label>' +
      '<label>Days / times that work for filming<input class="f" name="when" placeholder="e.g. Tue or Thu mornings in March"></label>' +
      '<label>Anything else? (optional)<textarea class="f" name="notes" rows="3" placeholder="A twist on the idea, a machine you want to use, etc."></textarea></label>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px"><button class="btn btn-primary" type="submit">✉ ' + (C.contactEmail ? "Open email to send" : "Copy text") + '</button>' + (C.contactEmail ? '<button class="btn" type="button" id="reqCopy">Copy text</button>' : "") + '</div>' +
      noEmailNote() + '</form>');
    function build() {
      var f = $("#reqForm"), v = function (n) { return f.elements[n].value.trim(); };
      store.set("me", { name: v("name"), role: v("role"), store: v("store") });
      var subject = "Video request: " + (list.length === 1 ? list[0].ID + " – " + list[0].Title : list.length + " ideas") + (v("name") ? " (" + v("name") + ")" : "");
      var body = "Hi " + (C.contactName || "") + ",\n\nI'd like to record " + (list.length === 1 ? "this video idea" : "these video ideas") + ":\n\n" +
        list.map(function (i) { return "• " + i.ID + " – " + i.Title + " (suggested showroom: " + suggested(i) + ", " + i.Department + ")\n  " + location.href.split("#")[0] + "#/idea/" + i.ID; }).join("\n") +
        "\n\nName: " + v("name") + "\nOn camera: " + v("cam") + "\nRole: " + v("role") + "\nShowroom: " + v("store") + "\nAvailability: " + v("when") + (v("notes") ? "\nNotes: " + v("notes") : "") + "\n\nThanks!";
      return { subject: subject, body: body };
    }
    $("#reqForm").onsubmit = function (e) { e.preventDefault(); var m = build(); sendEmail(m.subject, m.body, "Your request"); };
    var rc = $("#reqCopy"); if (rc) rc.onclick = function () { var m = build(); copyText("To: " + C.contactEmail + "\nSubject: " + m.subject + "\n\n" + m.body, "Request copied"); };
  }

  /* ---------------- "I have an idea" ---------------- */
  function ideaModal() {
    var me = store.get("me", {});
    var depts = ["", "Sales", "Parts", "Service", "Marketing", "Other"], seasons = ["Any time", "Spring", "Summer", "Fall", "Winter", "Holiday"];
    function opts(a) { return a.map(function (s) { return '<option value="' + esc(s) + '">' + (s || "Choose…") + "</option>"; }).join(""); }
    openModal('<div class="eyebrow">Share your idea</div><h2 id="modalTitle">I have an idea</h2><p class="muted small" style="margin-top:4px">Got a video you\'d love to make? Tell ' + esc(C.contactName || "Marketing") + ' about it. Rough ideas are welcome.</p>' +
      '<form class="form-grid" id="ideaForm">' +
      '<label>Your name<input class="f" name="name" required value="' + esc(me.name || "") + '"></label>' +
      '<div class="grid-2" style="gap:10px"><label>Your showroom' + storeSelect("store", me.store) + '</label><label>Department<select class="f" name="dept">' + opts(depts) + '</select></label></div>' +
      '<label>Idea title<input class="f" name="title" required placeholder="e.g. Guess the part by the sound"></label>' +
      '<label>What\'s the idea?<textarea class="f" name="idea" rows="4" required placeholder="What happens in the video? What would make people stop scrolling?"></textarea></label>' +
      '<label>Who would be on camera?<input class="f" name="cam" placeholder="You, a coworker, a customer…"></label>' +
      '<div class="grid-2" style="gap:10px"><label>Machine / product (optional)<input class="f" name="machine"></label><label>Best time of year<select class="f" name="season">' + opts(seasons) + '</select></label></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px"><button class="btn btn-primary" type="submit">✉ ' + (C.contactEmail ? "Send my idea" : "Copy text") + '</button></div>' + noEmailNote() + '</form>');
    $("#ideaForm").onsubmit = function (e) {
      e.preventDefault();
      var f = this, v = function (n) { return f.elements[n].value.trim(); };
      store.set("me", { name: v("name"), role: me.role || "", store: v("store") });
      var subject = "Content idea: " + v("title") + " (" + v("name") + ")";
      var body = "Hi " + (C.contactName || "") + ",\n\nI have a content idea:\n\nTitle: " + v("title") + "\n\n" + v("idea") +
        "\n\nOn camera: " + v("cam") + "\nMachine / product: " + v("machine") + "\nBest time of year: " + v("season") +
        "\n\nFrom: " + v("name") + "\nShowroom: " + v("store") + "\nDepartment: " + v("dept") + "\n\nThanks!";
      sendEmail(subject, body, "Your idea");
    };
  }
  $("#ideaBtnNav").onclick = ideaModal;
  document.addEventListener("click", function (e) { if (e.target.closest("[data-idea-btn]")) { e.preventDefault(); ideaModal(); } });

  /* ---------------- router ---------------- */
  function parseHash() {
    var h = location.hash.replace(/^#\/?/, ""), q = {};
    var parts = h.split("?"), path = parts[0].split("/").map(decodeURIComponent);
    if (parts[1]) parts[1].split("&").forEach(function (kv) { var p = kv.split("="); if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || "").replace(/\+/g, " ")); });
    return { path: path, q: q };
  }
  function setActive(name) { $$(".nav a").forEach(function (a) { a.classList.toggle("active", a.getAttribute("data-nav") === name); }); }
  function route() {
    var r = parseHash(), p = r.path[0] || "";
    $("#nav").classList.remove("open");
    var views = { "": viewIdeas, ideas: viewIdeas, idea: viewIdea, picks: viewPicks, plan: viewPlan, campaigns: viewCampaigns, dashboard: viewDashboard, stores: viewStores, print: viewPrint, owner: viewOwner, brain: viewBrain };
    (views[p] || viewIdeas)(r);
    if (!route._keepScroll) window.scrollTo(0, 0);
    route._keepScroll = false;
  }
  window.addEventListener("hashchange", route);
  $("#menuBtn").onclick = function () { var n = $("#nav"); n.classList.toggle("open"); this.setAttribute("aria-expanded", n.classList.contains("open")); };

  /* ================= IDEA CATALOG ================= */
  var FILTERS = [
    ["dept", "Department", "Department"], ["pillar", "Content Pillar", "Content type"], ["season", "Season", "Season"]
  ];
  function optionList(field) {
    var vals = uniq(ideas.map(function (i) { return i[field]; }));
    var order = { Season: (S.lists && S.lists.Seasons) || [] }[field];
    if (order) vals.sort(function (a, b) { var x = order.indexOf(a), y = order.indexOf(b); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y); });
    else vals.sort();
    return vals;
  }
  function ideaCard(i) {
    var a = availability(i);
    return '<a class="idea card" href="#/idea/' + esc(i.ID) + '">' +
      '<div class="idea-top"><span class="idea-id">' + esc(i.ID) + ' · ' + esc(i.Department) + '</span>' +
      (a.key === "open" ? "" : '<span class="badge ' + a.cls + '">' + esc(a.label) + '</span>') + '</div>' +
      '<h3>' + esc(i.Title) + '</h3>' +
      '<p>' + esc(i["The Idea"]) + '</p>' +
      '<div class="idea-foot"><span>📍 ' + esc(suggested(i)) + ' &nbsp;·&nbsp; ~' + esc(i["Est. Film Min"]) + ' min</span>' +
      '<button class="pick-btn" data-pick="' + esc(i.ID) + '" aria-label="Save to My Picks">' + (picks.indexOf(i.ID) >= 0 ? "★ Picked" : "☆ Pick") + '</button></div></a>';
  }
  function filterIdeas(q) {
    var term = (q.q || "").toLowerCase().trim();
    var list = ideas.filter(function (i) {
      if (q.store === "Company-wide") { if (i.Scope !== "Universal") return false; }
      else if (q.store) { if (q.local === "1" ? i.Showroom !== q.store : !fitsStore(i, q.store)) return false; }
      for (var k = 0; k < FILTERS.length; k++) { var f = FILTERS[k]; if (q[f[0]] && i[f[1]] !== q[f[0]]) return false; }
      var a = availability(i).key;
      if (q.avail === "open" && a !== "open") return false;
      if (q.avail === "taken" && (a === "open" || a === "dropped")) return false;
      if (!q.avail && a === "dropped") return false;
      if (term) {
        var hay = [i.ID, i.Title, i["The Idea"], i["Machine / Product"], i["Opening Hook"], i["Content Pillar"], i.Department, i.Talent, i.Audience].join(" ").toLowerCase();
        if (term.split(/\s+/).some(function (w) { return hay.indexOf(w) < 0; })) return false;
      }
      return true;
    });
    return list;
  }
  function qs(q) { var s = Object.keys(q).filter(function (k) { return q[k]; }).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(q[k]); }).join("&"); return s ? "?" + s : ""; }

  function viewIdeas(r) {
    setActive("ideas");
    var q = r.q;
    var storeTabs = ["", "Company-wide"].concat(STORES).map(function (s) {
      return '<button class="store-tab' + ((q.store || "") === s ? " active" : "") + '" data-store="' + esc(s) + '">' + (s || "All stores") + '</button>';
    }).join("");
    var selects = FILTERS.map(function (f) {
      return '<select class="f" data-f="' + f[0] + '" aria-label="' + esc(f[2]) + '"><option value="">' + esc(f[2]) + '</option>' +
        optionList(f[1]).map(function (v) { return '<option' + (q[f[0]] === v ? " selected" : "") + '>' + esc(v) + '</option>'; }).join("") + '</select>';
    }).join("");
    app.innerHTML =
      '<div class="cat-hero"><div><h1>Pick a video to record</h1>' +
      '<p>Find an idea, open it to see the hook and the shots, then tap <strong>I want to record this</strong>.</p></div>' +
      '<button class="btn btn-dark hero-idea" data-idea-btn>💡 I have an idea</button></div>' +
      '<div class="filters no-print">' +
      '<div class="store-tabs">' + storeTabs + '</div>' +
      '<div class="filter-row"><div class="search"><input id="q" type="search" placeholder="Search ideas or machines (e.g. Sea-Doo, winter, helmet)" value="' + esc(q.q || "") + '" aria-label="Search ideas"></div>' + selects +
      '<select class="f" data-f="avail" aria-label="Availability"><option value="">Status: all</option><option value="open"' + (q.avail === "open" ? " selected" : "") + '>Open to record only</option><option value="taken"' + (q.avail === "taken" ? " selected" : "") + '>Already scheduled</option><option value="all"' + (q.avail === "all" ? " selected" : "") + '>Everything</option></select></div>' +
      (q.store && q.store !== "Company-wide" ? '<label class="check"><input type="checkbox" id="localOnly"' + (q.local === "1" ? " checked" : "") + '> Only ' + esc(q.store) + '’s own ideas (hide company-wide)</label>' : "") + '</div>' +
      '<div class="result-bar"><strong id="count"></strong><span><button class="btn btn-sm btn-ghost" id="copyView">🔗 Copy link to this view</button><button class="btn btn-sm btn-ghost" id="clearF">Clear</button></span></div>' +
      '<div class="ideas" id="grid"></div>';

    function render() {
      var list = filterIdeas(q);
      $("#count").textContent = list.length + " idea" + (list.length === 1 ? "" : "s") + (q.store ? " for " + q.store : "");
      $("#grid").innerHTML = list.length ? list.map(ideaCard).join("") : '<div class="empty card" style="grid-column:1/-1">No ideas match those filters. <a href="#/">Clear filters</a></div>';
    }
    function push() { route._keepScroll = true; history.replaceState(null, "", "#/ideas" + qs(q)); render(); }
    render();
    $$(".store-tab").forEach(function (b) { b.onclick = function () { q.store = b.getAttribute("data-store"); delete q.local; route._keepScroll = true; location.hash = "#/ideas" + qs(q); }; });
    $$("[data-f]").forEach(function (s) { s.onchange = function () { q[s.getAttribute("data-f")] = s.value; push(); }; });
    var lo = $("#localOnly"); if (lo) lo.onchange = function () { q.local = lo.checked ? "1" : ""; push(); };
    var t; $("#q").oninput = function (e) { clearTimeout(t); t = setTimeout(function () { q.q = e.target.value; push(); }, 150); };
    $("#copyView").onclick = function () { copyText(location.href.split("#")[0] + "#/ideas" + qs(q), "Link copied — paste it in a text or email"); };
    $("#clearF").onclick = function () { location.hash = "#/"; };
  }

  /* ================= IDEA DETAIL ================= */
  function field(label, v, cls) { return v === "" || v == null ? "" : '<div class="field ' + (cls || "") + '"><div class="k">' + esc(label) + '</div><div class="v">' + esc(v) + '</div></div>'; }
  function fact(k, v) { return '<div class="fact"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v || "—") + '</div></div>'; }

  function printCard(i) {
    function row(k, v) { return '<div class="pc-row"><div class="pc-k">' + esc(k) + '</div><div class="pc-v">' + esc(v || "") + '</div></div>'; }
    var showroom = suggested(i) + (i.Scope === "Universal" ? "  (also works at: " + i["Compatible Showrooms"] + ")" : "");
    var camName = store.get("cam", {})[i.ID] || i["Scheduled Talent"] || "";
    var checks = ["Talent confirmed and briefed with 'Explain Video'", "Machine/product on site, clean, correct model verified", "Props gathered (see Prep / Props)", "Releases signed for any customer or minor on camera", "Batteries charged, storage cleared, lav mic tested", "All 5 key film shots captured + B-roll", "Hook recorded 2–3 ways", "Footage logged in FOOTAGE sheet with file location"];
    return '<div class="print-card"><div class="pc"><div class="pc-title">' + esc(i.ID + "  —  " + i.Title) + '</div>' +
      row("The idea", i["The Idea"]) + row("Target time", i["Target Time"]) + row("Opening hook", i["Opening Hook"]) + row("Ask the talent", i["Ask the Talent"]) +
      row("Key film shots", i["Key Film Shots"]) + row("Make it funny", i["Make It Funny"]) + row("Editing notes", i["Editing Notes"]) + row("On-screen words", i["On-Screen Words"]) +
      row("CTA", i.CTA) + row("Suggested area", i["Suggested Showroom Area"]) + row("Suggested showroom", showroom) + row("Who's on camera", camName ? camName + "  (" + i.Talent + ")" : "________________________  (suggested: " + i.Talent + ")") + row("Machine", i["Machine / Product"]) +
      row("Filming date", i["Planned Film Date"] ? fmtDate(i["Planned Film Date"]) : "") + row("Explain video", i["Explain Video"]) + row("Prep / props", i["Prep / Props"]) + row("Caption idea", i["Caption Idea"]) +
      '</div><div class="pc" style="break-before:page"><div class="pc-title">' + esc(i.ID + "  —  Production details") + '</div>' +
      row("Department", i.Department) + row("Content pillar", i["Content Pillar"]) + row("Target audience", i.Audience) + row("Audience insight", i["Audience Insight"]) +
      row("Creative objective", i.Objective) + row("Season / timing", i.Season + " • " + i.Timing) + row("Platforms", i.Platforms) + row("Scene-by-scene", i["Scene-by-Scene"]) +
      row("B-roll", i["B-roll"]) + row("Camera setup", i["Camera Setup"]) + row("Pacing / transitions", i.Pacing + " • " + i.Transitions) + row("Audio & music", i["Audio & Music"]) +
      row("Branding / end card", i["Branding / End Card"]) + row("Hashtags", i.Hashtags) + row("Est. film time (min)", i["Est. Film Min"]) + row("Localization", i["Localization Notes"]) + row("Verify before posting", i["Verify Before Posting"]) +
      '<div class="pc-sub">Filming-day checklist</div><ul class="checklist">' + checks.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + '</ul>' +
      '<div class="pc-sub">Day-of notes</div><div style="height:90px"></div></div></div>';
  }

  function cardboardPrompt(i, x) {
    var L = [], add = function (k, v) { if (v !== "" && v != null) L.push(k + ": " + v); };
    var page = i.Scope === "Universal" ? "Universal (compatible: " + i["Compatible Showrooms"] + "). Make one version per page; swap end card." : i.Showroom;
    L.push("JOHNNY K'S POWERSPORTS | CREATIVE VIDEO EDITING BRIEF");
    L.push("Idea " + i.ID + ". Use this brief to edit the media I provided. Follow the specific instructions first; use sound editorial judgment only where details are missing.", "", "PROJECT / DISTRIBUTION");
    add("Video title", i.Title); add("Showroom / page", page); add("Audience", i.Audience); add("Video objective", i.Objective); add("Target duration", i["Target Time"]); add("Output aspect ratio", i["Aspect Ratio"]);
    L.push("Posting platforms: FB Reels, IG Reels, TikTok (export one 9:16 master)", "", "STORY / CONTENT");
    add("Main goal / creative overview", i["The Idea"]); add("Opening hook (first 3 seconds)", i["Opening Hook"]);
    L.push("Scene order:", i["Scene-by-Scene"], "Shots to include:", i["Key Film Shots"]);
    add("B-roll placement", i["B-roll"]); add("Exact on-screen wording", i["On-Screen Words"]); add("Call to action", i.CTA);
    add("Approved specs / features / promotions", x.specs); add("Legal disclaimer / required fine print", x.disc);
    L.push("", "EDITING DIRECTION");
    add("Pacing", i.Pacing); add("Transition style", i.Transitions); add("Music / audio", i["Audio & Music"]); add("Caption style", i["Captions / Subtitles"]);
    L.push("Comedy beats (use only if captured in the footage):", i["Make It Funny"]);
    add("Special editing directions", i["Editing Notes"]); L.push("Color: natural + punchy; match every clip."); add("Branding / end card", i["Branding / End Card"]);
    L.push("", "FOOTAGE / RESTRICTIONS");
    add("Media filenames", x.files); add("Best moments / timecodes", x.best); add("Do not include", x.dont); add("Must verify", i["Verify Before Posting"]);
    L.push("Use only the footage provided. If a listed shot or comedy beat is missing, skip it and tell me; do not generate it.", "");
    if (S.standards) L.push(S.standards);
    L.push("EXPORT: 1080x1920 (9:16), H.264 MP4, 30 fps, burned-in subtitles, end card in the last 3 seconds.");
    return L.join("\n");
  }

  function viewIdea(r) {
    setActive("ideas");
    var i = byId[r.path[1]];
    if (!i) { app.innerHTML = '<div class="empty card"><h2>Idea not found</h2><p>“' + esc(r.path[1]) + '” isn\'t in the catalog. <a href="#/">Back to the catalog</a></p></div>'; return; }
    var a = availability(i), info = i.Scope === "Universal" ? null : storeInfo(i.Showroom);
    var idx = ideas.indexOf(i), prev = ideas[idx - 1], next = ideas[idx + 1];
    var stat = [["Production status", i["Production Status"]], ["Publishing status", i["Publishing Status"]], ["Assigned to", i["Assigned To"]], ["Scheduled talent", i["Scheduled Talent"]],
      ["Planned film date", fmtDate(i["Planned Film Date"])], ["Actual film date", fmtDate(i["Actual Film Date"])], ["Planned post date", fmtDate(i["Planned Post Date"])],
      ["Filmed", i.Filmed], ["Edited", i.Edited], ["Approval check", i["Approval Check"]], ["Caption", i.Caption], ["Posted / scheduled", i["Posted / Scheduled"]],
      ["Unique assets", i["Unique Assets"]], ["Placements", i.Placements], ["Total views", i["Total Views"] ? fmtNum(i["Total Views"]) : ""]]
      .filter(function (p) { return p[1] !== "" && p[1] != null && p[1] !== 0; });

    app.innerHTML =
      '<div class="crumbs no-print"><a href="javascript:history.length>1?history.back():location.hash=\'#/\'">← Back to catalog</a>' +
      '<span style="float:right">' + (prev ? '<a href="#/idea/' + esc(prev.ID) + '">‹ ' + esc(prev.ID) + '</a>' : "") + (next ? ' &nbsp; <a href="#/idea/' + esc(next.ID) + '">' + esc(next.ID) + ' ›</a>' : "") + '</span></div>' +
      '<div class="no-print">' +
      '<div class="detail-head card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="idea-id">' + esc(i.ID) + '</span><span class="badge ' + a.cls + '">' + esc(a.label) + '</span>' +
      '<span class="chip chip-red">' + esc(i.Department) + '</span><span class="chip">' + esc(i["Content Pillar"]) + '</span></div>' +
      '<h1>' + esc(i.Title) + '</h1>' +
      '<div class="detail-actions"><button class="btn btn-primary" id="reqBtn">🎬 I want to record this</button><button class="pick-btn btn" data-pick="' + esc(i.ID) + '"></button>' +
      '<button class="btn" id="printBtn">🖨 Print idea card</button><button class="btn" id="linkBtn">🔗 Copy link</button></div>' +
      '<div class="facts">' +
      '<div class="fact fact-wide"><label class="k" for="camIn">Who\'s on camera</label>' + (i["Scheduled Talent"] ? '<div class="v">' + esc(i["Scheduled Talent"]) + ' <span class="muted small">(scheduled)</span></div>'
        : '<input class="cam-input" id="camIn" placeholder="Type your name" value="' + esc(store.get("cam", {})[i.ID] || "") + '"><div class="muted small">Suggested: ' + esc(i.Talent) + '</div>') + '</div>' +
      '<div class="fact fact-wide"><div class="k">Suggested showroom</div><div class="v">📍 ' + esc(suggested(i)) + '</div>' + (suggestWhy(i) ? '<div class="muted small">' + esc(suggestWhy(i)) + '</div>' : (i.Scope === "Universal" ? "" : '<div class="muted small">This store\'s own idea</div>')) + '</div>' +
      fact("Filming spot", i["Suggested Showroom Area"]) + fact("Machine / product", i["Machine / Product"]) + fact("Difficulty", i.Difficulty) +
      fact("Film time", "~" + i["Est. Film Min"] + " min") + fact("Video length", i["Target Time"]) + fact("Format", i["Aspect Ratio"]) + fact("Season", i.Season + " • " + i.Timing).replace('class="fact"', 'class="fact fact-wide"') + '</div></div>' +

      '<div class="detail-grid"><div>' +
      '<section class="panel card"><h3><span class="n">1</span>The idea</h3>' + field("What it is", i["The Idea"], "big") +
      '<div class="field"><div class="k">Opening hook (first 3 seconds)</div><div class="hook">' + esc(i["Opening Hook"]) + '</div></div>' +
      field("Alternate hook", i["Alternate Hook"]) + field("How to explain it to the talent", i["Explain Video"]) + '</section>' +

      '<section class="panel card"><h3><span class="n">2</span>For the talent</h3>' + field("Questions you'll answer on camera", i["Ask the Talent"]) + field("Make it funny", i["Make It Funny"]) + field("Prep / props", i["Prep / Props"]) + '</section>' +

      '<section class="panel card"><h3><span class="n">3</span>Shot plan</h3>' + field("Key film shots", i["Key Film Shots"]) + field("Scene-by-scene", i["Scene-by-Scene"]) + field("B-roll", i["B-roll"]) + field("Camera setup", i["Camera Setup"]) + '</section>' +

      '<section class="panel card"><h3><span class="n">4</span>Editing &amp; posting</h3>' + field("Editing notes", i["Editing Notes"]) + field("Pacing", i.Pacing) + field("Transitions", i.Transitions) +
      field("Audio & music", i["Audio & Music"]) + field("Captions / subtitles", i["Captions / Subtitles"]) + field("On-screen words", i["On-Screen Words"]) + field("Call to action", i.CTA) +
      field("Caption idea", i["Caption Idea"]) + field("Hashtags", i.Hashtags) + field("Branding / end card", i["Branding / End Card"]) + field("Repurposing", i.Repurposing) + field("Localization", i["Localization Notes"]) + '</section>' +

      (!isOwner() ? "" : '<details class="panel card" id="cbPanel"><summary><h3 style="margin:0"><span class="n">5</span>Cardboard AI editing prompt</h3></summary><div style="margin-top:12px" class="form-grid">' +
      '<p class="muted small" style="margin:0">Fill in what you have, then copy the prompt into Cardboard and upload your clips there.</p>' +
      '<label>Uploaded file names<input class="f" data-cb="files"></label><label>Best moments / timecodes<input class="f" data-cb="best"></label><label>Do NOT use / cut out<input class="f" data-cb="dont"></label>' +
      '<label>Verified product details or approved offer (optional)<input class="f" data-cb="specs"></label><label>Required disclaimer (optional)<input class="f" data-cb="disc"></label>' +
      '<textarea class="prompt-box" id="cbOut" readonly></textarea><div><button class="btn btn-dark" id="cbCopy">Copy prompt</button></div><p class="muted small" style="margin:0">🔒 Only you can see this section.</p></div></details>') +
      '</div><aside>' +
      '<section class="panel card"><h3>Strategy</h3><dl class="kv"><dt>Audience</dt><dd>' + esc(i.Audience) + '</dd><dt>Insight</dt><dd>' + esc(i["Audience Insight"]) + '</dd><dt>Objective</dt><dd>' + esc(i.Objective) +
      '</dd><dt>Platforms</dt><dd>' + esc(i.Platforms) + '</dd><dt>' + (i.Scope === "Universal" ? "Also works at" : "Store") + '</dt><dd>' + esc(i["Compatible Showrooms"]) + '</dd></dl></section>' +
      '<section class="panel card"><h3>Before you post</h3><div class="callout">' + esc(i["Verify Before Posting"]) + '</div></section>' +
      '<section class="panel card"><h3>Production status</h3>' + (stat.length ? '<dl class="kv">' + stat.map(function (p) { return "<dt>" + esc(p[0]) + "</dt><dd>" + esc(p[1]) + "</dd>"; }).join("") + '</dl>' : '<p class="muted small">Not started yet.</p>') + '</section>' +
      (info ? '<section class="panel card"><h3>' + esc(info.Showroom) + ' store</h3><dl class="kv"><dt>Address</dt><dd>' + esc(info.Address) + '</dd><dt>Phone</dt><dd>' + esc(info.Phone) + '</dd><dt>Hours</dt><dd>' + esc(info.Hours) + '</dd></dl></section>' : "") +
      '</aside></div></div>' +
      '<div class="print-only">' + printCard(i) + '</div>';

    setPickBtn($('.detail-actions [data-pick]'), i.ID);
    $("#reqBtn").onclick = function () { requestModal([i.ID]); };
    $("#printBtn").onclick = function () { window.print(); };
    $("#linkBtn").onclick = function () { copyText(location.href.split("#")[0] + "#/idea/" + i.ID, "Link copied"); };
    var x = {};
    var ci = $("#camIn");
    if (ci) ci.oninput = function () { var m = store.get("cam", {}); if (ci.value.trim()) m[i.ID] = ci.value.trim(); else delete m[i.ID]; store.set("cam", m); var pc = $(".print-only"); if (pc) pc.innerHTML = printCard(i); };
    if (!$("#cbOut")) return;
    function upd() { $$("[data-cb]").forEach(function (el) { x[el.getAttribute("data-cb")] = el.value.trim(); }); $("#cbOut").value = cardboardPrompt(i, x); }
    $$("[data-cb]").forEach(function (el) { el.oninput = upd; }); upd();
    $("#cbCopy").onclick = function () { copyText($("#cbOut").value, "Prompt copied — paste it into Cardboard"); };
  }

  /* ================= MY PICKS ================= */
  function viewPicks() {
    setActive("picks");
    var list = picks.map(function (id) { return byId[id]; }).filter(Boolean);
    app.innerHTML = '<div class="page-head"><div><div class="eyebrow">Your shortlist</div><h1>My Picks</h1><p>Ideas you starred are saved on this device. Send them all in one request, print them, or open them in the Filming Planner.</p></div>' +
      (list.length ? '<div class="detail-actions"><button class="btn btn-primary" id="reqAll">🎬 Request all ' + list.length + '</button><a class="btn" href="#/plan">🗓 Plan a filming day</a><a class="btn" href="#/print?ids=' + encodeURIComponent(picks.join(",")) + '">🖨 Print cards</a><button class="btn btn-ghost" id="clearPicks">Clear</button></div>' : "") + '</div>' +
      (list.length ? '<div class="ideas">' + list.map(ideaCard).join("") + '</div>' : '<div class="empty card"><h2>No picks yet</h2><p>Tap <strong>☆ Pick</strong> on any idea in the <a href="#/">catalog</a> to save it here.</p></div>');
    if (list.length) {
      $("#reqAll").onclick = function () { requestModal(picks.slice()); };
      $("#clearPicks").onclick = function () { if (confirmInline(this)) { picks = []; savePicks(); viewPicks(); } };
    }
  }
  function confirmInline(btn) { if (btn.dataset.sure) return true; btn.dataset.sure = "1"; btn.textContent = "Click again to clear"; return false; }

  /* ================= PRINT (card book) ================= */
  function viewPrint(r) {
    setActive("");
    var list = r.q.ids ? r.q.ids.split(",").map(function (id) { return byId[id]; }).filter(Boolean)
      : ideas.filter(function (i) { return r.q.store ? (r.q.store === "Company-wide" ? i.Scope === "Universal" : i.Showroom === r.q.store) : true; });
    var opts = ["", "Company-wide"].concat(STORES).map(function (s) { return '<option value="' + esc(s) + '"' + ((r.q.store || "") === s ? " selected" : "") + '>' + (s || "All 250 ideas") + '</option>'; }).join("");
    app.innerHTML = '<div class="page-head no-print"><div><div class="eyebrow">Card book</div><h1>Print idea cards</h1><p>Each idea prints as 2 pages: the card and its production details + checklist. ' + list.length + ' idea' + (list.length === 1 ? "" : "s") + ' selected (' + list.length * 2 + ' pages).</p></div>' +
      '<div class="detail-actions">' + (r.q.ids ? "" : '<select class="f" id="pStore">' + opts + '</select>') + '<button class="btn btn-primary" onclick="window.print()">🖨 Print</button></div></div>' +
      list.map(printCard).join("");
    var ps = $("#pStore"); if (ps) ps.onchange = function () { location.hash = "#/print" + qs({ store: ps.value }); };
  }

  /* ================= FILMING PLANNER ================= */
  function viewPlan() {
    setActive("plan");
    var plan = store.get("plan", { store: "", date: "", start: "09:30", ids: [] });
    if (!plan.ids.length && picks.length) plan.ids = picks.slice(0, 12);
    var areas = {}; (S.areas || []).forEach(function (a) { areas[a.Area] = a; });
    var buffer = num(S.buffer);

    function compute() {
      var rows = plan.ids.map(function (id, k) { return { i: byId[id], slot: k + 1 }; }).filter(function (x) { return x.i; });
      rows.forEach(function (x) {
        var ord = areas[x.i["Suggested Showroom Area"]] ? num(areas[x.i["Suggested Showroom Area"]]["Filming Order"]) : 99;
        var sameAreaLower = rows.filter(function (y) { return y.i["Suggested Showroom Area"] === x.i["Suggested Showroom Area"] && y.i.Talent < x.i.Talent; }).length;
        x.key = ord * 1000 + sameAreaLower * 20 + x.slot;
      });
      rows.sort(function (a, b) { return a.key - b.key; });
      var t = 0, block = 0, last = null, s0 = (plan.start || "09:30").split(":"), base = num(s0[0]) * 60 + num(s0[1]);
      rows.forEach(function (x) {
        var area = x.i["Suggested Showroom Area"];
        x.setup = 0;
        if (area !== last) { block++; x.setup = areas[area] ? num(areas[area]["Setup Min"]) : 10; x.newBlock = true; last = area; }
        x.block = block; t += x.setup; x.start = base + t; t += num(x.i["Est. Film Min"]) * (1 + buffer); x.end = base + t;
        x.check = !plan.store ? "" : x.i.Showroom === plan.store ? "OK" : x.i.Scope === "Universal" ? (fitsStore(x.i, plan.store) ? "OK (universal)" : "Brand not at this store") : "Different store";
        x.talentN = rows.filter(function (y) { return y.i.Talent === x.i.Talent; }).length;
      });
      return rows;
    }
    function hm(m) { m = Math.round(m); var h = Math.floor(m / 60) % 24, mm = m % 60, ap = h >= 12 ? "PM" : "AM"; return ((h + 11) % 12 + 1) + ":" + String(mm).padStart(2, "0") + " " + ap; }

    function render() {
      store.set("plan", plan);
      var rows = compute();
      var film = rows.reduce(function (s, x) { return s + num(x.i["Est. Film Min"]); }, 0), setup = rows.reduce(function (s, x) { return s + x.setup; }, 0);
      var total = Math.round(film * (1 + buffer) + setup);
      var props = uniq(rows.map(function (x) { return x.i["Prep / Props"]; }).join(", ").split(/,\s*/).map(function (s) { return s.trim(); }));
      var html = '<div class="stats"><div class="stat card"><div class="num">' + rows.length + '</div><div class="lbl">Videos selected (max 12)</div></div>' +
        '<div class="stat card"><div class="num">' + film + '</div><div class="lbl">Film minutes</div></div>' +
        '<div class="stat card"><div class="num">' + (rows.length ? rows[rows.length - 1].block : 0) + '</div><div class="lbl">Setup blocks (' + setup + ' min)</div></div>' +
        '<div class="stat card"><div class="num">' + total + '</div><div class="lbl">Total min incl. ' + Math.round(buffer * 100) + '% buffer</div></div>' +
        '<div class="stat card"><div class="num">' + (rows.length ? hm(rows[rows.length - 1].end) : "—") + '</div><div class="lbl">Estimated wrap</div></div></div>';
      if (rows.length) {
        html += '<div class="section"><h2>Recommended filming order</h2><div class="table-wrap"><table class="t"><thead><tr><th>#</th><th>Time</th><th>Idea</th><th>Talent</th><th>Key shots</th><th>Prep / props</th>' + (plan.store ? "<th>Store check</th>" : "") + '</tr></thead><tbody>';
        rows.forEach(function (x, k) {
          if (x.newBlock) { var a = areas[x.i["Suggested Showroom Area"]] || {}; html += '<tr class="block-head"><td colspan="' + (plan.store ? 7 : 6) + '">Block ' + x.block + ' • ' + esc(x.i["Suggested Showroom Area"]) + ' • +' + x.setup + ' min setup' + (a["Shared B-roll to grab once"] ? ' • <span style="font-weight:500">Grab once: ' + esc(a["Shared B-roll to grab once"]) + '</span>' : "") + '</td></tr>'; }
          html += '<tr><td>' + (k + 1) + '</td><td style="white-space:nowrap">' + hm(x.start) + '–' + hm(x.end) + '</td><td><a href="#/idea/' + esc(x.i.ID) + '"><strong>' + esc(x.i.ID) + '</strong></a><br>' + esc(x.i.Title) + '<br><span class="muted small">' + esc(x.i["Machine / Product"]) + ' • ' + esc(x.i["Est. Film Min"]) + ' min</span></td>' +
            '<td>' + esc(x.i.Talent) + '<br><span class="muted small">' + (x.talentN > 1 ? "In " + x.talentN + " videos: keep on set" : "Single video") + '</span></td><td class="small" style="white-space:pre-line">' + esc(x.i["Key Film Shots"]) + '</td><td class="small">' + esc(x.i["Prep / Props"]) + '</td>' +
            (plan.store ? '<td class="' + (/^OK/.test(x.check) ? "check-ok" : "check-bad") + '">' + esc(x.check) + '</td>' : "") + '</tr>';
        });
        html += '</tbody></table></div></div><div class="section"><h2>Bring list</h2><div class="card panel"><ul class="checklist" style="columns:3">' + props.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + '</ul></div></div>' +
          '<p class="muted small">Order is rule-based: grouped by filming area (' + (S.areas || []).map(function (a) { return a.Area; }).join(" → ") + '), then by talent so employees are pulled off the floor once. Adjust on the day for lighting, customer traffic and machine availability.</p>';
      }
      $("#planOut").innerHTML = html;
      $("#slots").innerHTML = plan.ids.map(function (id, k) { var i = byId[id]; return '<div class="slot"><span class="i">' + (k + 1) + '</span><strong>' + esc(id) + '</strong><span>' + (i ? esc(i.Title) + ' <span class="muted small">• ' + esc(i["Suggested Showroom Area"]) + '</span>' : '<span class="check-bad">ID not found</span>') + '</span><button class="btn btn-sm btn-ghost" data-rm="' + k + '" aria-label="Remove">✕</button></div>'; }).join("") ||
        '<p class="muted">No ideas yet. Add IDs below, or star ideas in the catalog and click “Use My Picks”.</p>';
      $$("[data-rm]").forEach(function (b) { b.onclick = function () { plan.ids.splice(+b.getAttribute("data-rm"), 1); render(); }; });
    }

    var storeOpts = [""].concat(STORES).map(function (s) { return '<option' + (plan.store === s ? " selected" : "") + ' value="' + esc(s) + '">' + (s || "Choose showroom…") + '</option>'; }).join("");
    app.innerHTML = '<div class="page-head"><div><div class="eyebrow">Filming day</div><h1>Filming Planner</h1><p>Pick up to 12 ideas for one session. The planner groups them by area and talent, adds setup time, and builds a printable run-of-show and bring list.</p></div>' +
      '<div class="detail-actions no-print"><button class="btn btn-primary" onclick="window.print()">🖨 Print plan</button></div></div>' +
      '<div class="card panel no-print"><div class="filter-row"><label class="form-grid" style="flex:1 1 200px">Showroom<select class="f" id="pStore">' + storeOpts + '</select></label>' +
      '<label class="form-grid" style="flex:1 1 160px">Filming date<input class="f" type="date" id="pDate" value="' + esc(plan.date) + '"></label>' +
      '<label class="form-grid" style="flex:1 1 140px">Start time<input class="f" type="time" id="pStart" value="' + esc(plan.start) + '"></label></div>' +
      '<div class="section" style="margin-top:16px"><h3 style="margin-bottom:8px">Videos in this session</h3><div class="plan-slots" id="slots"></div>' +
      '<div class="filter-row" style="margin-top:10px"><input class="f" id="addId" list="idList" placeholder="Type an idea ID, e.g. V-ELY-003" style="flex:1 1 220px"><datalist id="idList">' + ideas.map(function (i) { return '<option value="' + esc(i.ID) + '">' + esc(i.Title) + '</option>'; }).join("") + '</datalist>' +
      '<button class="btn btn-dark" id="addBtn">Add</button><button class="btn" id="usePicks">Use My Picks (' + picks.length + ')</button><button class="btn btn-ghost" id="clearPlan">Clear</button></div></div></div>' +
      '<div class="print-only"><h1>Filming plan</h1><p id="printMeta"></p></div><div id="planOut" style="margin-top:16px"></div>';
    function meta() { $("#printMeta").textContent = [plan.store, plan.date ? fmtDate(plan.date) : "", plan.start ? "Start " + plan.start : ""].filter(Boolean).join(" • "); }
    $("#pStore").onchange = function () { plan.store = this.value; meta(); render(); };
    $("#pDate").onchange = function () { plan.date = this.value; meta(); render(); };
    $("#pStart").onchange = function () { plan.start = this.value; meta(); render(); };
    function add() { var v = $("#addId").value.trim().toUpperCase(); if (!v) return; if (!byId[v]) { toast("No idea with ID " + v); return; } if (plan.ids.length >= 12) { toast("12 videos max per session"); return; } if (plan.ids.indexOf(v) >= 0) { toast("Already added"); return; } plan.ids.push(v); $("#addId").value = ""; render(); }
    $("#addBtn").onclick = add; $("#addId").onkeydown = function (e) { if (e.key === "Enter") add(); };
    $("#usePicks").onclick = function () { plan.ids = picks.slice(0, 12); if (picks.length > 12) toast("Used the first 12 picks"); render(); };
    $("#clearPlan").onclick = function () { plan.ids = []; render(); };
    meta(); render();
  }

  /* ================= CAMPAIGNS ================= */
  function viewCampaigns(r) {
    setActive("campaigns");
    var camps = D.campaigns || [], lib = D.campaignLibrary || [];
    var year = 2027;
    camps.forEach(function (c) { var d = parseDate(c.Start); if (d) year = d.getFullYear(); });
    var y0 = new Date(year, 0, 1), y1 = new Date(year + 1, 0, 1), span = y1 - y0;
    function pct(s) { var d = parseDate(s); return d ? Math.max(0, Math.min(100, (d - y0) / span * 100)) : 0; }
    var today = new Date(), todayPct = today >= y0 && today < y1 ? (today - y0) / span * 100 : -1;

    var gantt = '<div class="card gantt"><div class="gantt-inner"><div class="g-months"><div></div>' + MONTHS.map(function (m) { return "<div>" + m + "</div>"; }).join("") + '</div>' +
      camps.map(function (c, k) {
        var l = pct(c.Start), w = Math.max(1, pct(c.End) - l + 100 / 365);
        return '<div class="g-row"><div class="g-label">' + esc(c.Campaign) + '<small>' + esc(c.Showroom) + ' • ' + esc(c.Type) + '</small></div><div class="g-track">' +
          (todayPct >= 0 ? '<div class="g-today" style="left:' + todayPct + '%" title="Today"></div>' : "") +
          '<div class="g-bar' + (c.Priority === "High" ? "" : " med") + '" data-c="' + k + '" style="left:' + l + '%;width:' + w + '%" tabindex="0" role="button" aria-label="' + esc(c.Campaign + ", " + fmtDate(c.Start) + " to " + fmtDate(c.End)) + '"></div></div></div>';
      }).join("") + '</div><p class="muted small" style="margin:10px 0 0">Dark red = high priority, light red = medium. Hover or tap a bar for details.</p></div>';

    // month-by-month
    var months = MONTHS.map(function () { return []; });
    camps.forEach(function (c) { var a = parseDate(c.Start), b = parseDate(c.End) || a; if (!a) return; for (var m = a.getMonth(); m <= b.getMonth() && a.getFullYear() === year; m++) months[m].push({ t: "camp", d: c.Start, html: '<strong>' + esc(c.Campaign) + '</strong> — ' + esc(c.Showroom) + ' <span class="muted">(' + fmtShort(c.Start) + '–' + fmtShort(c.End) + ')</span>' }); });
    (D.placements || []).forEach(function (p) { var d = parseDate(p["Actual Post Date"] || p["Planned Date"]); if (!d || d.getFullYear() !== year) return; months[d.getMonth()].push({ t: "post", d: p["Planned Date"], html: fmtShort(p["Actual Post Date"] || p["Planned Date"]) + ' • <a href="#/idea/' + esc(p["Idea ID"]) + '">' + esc(p.Title || p["Idea ID"]) + '</a> <span class="muted">→ ' + esc(p["Page / Account"]) + ' (' + esc(p.Status) + ')' + (p["Sample?"] === "Yes" ? " • sample" : "") + '</span>' }); });
    ideas.forEach(function (i) { var d = parseDate(i["Planned Film Date"]); if (d && d.getFullYear() === year) months[d.getMonth()].push({ t: "film", d: i["Planned Film Date"], html: fmtShort(i["Planned Film Date"]) + ' • <a href="#/idea/' + esc(i.ID) + '">' + esc(i.Title) + '</a> <span class="muted">(' + esc(storeLabel(i)) + ')</span>' });
      var p = parseDate(i["Planned Post Date"]); if (p && p.getFullYear() === year) months[p.getMonth()].push({ t: "post", d: i["Planned Post Date"], html: fmtShort(i["Planned Post Date"]) + ' • <a href="#/idea/' + esc(i.ID) + '">' + esc(i.Title) + '</a> <span class="muted">(planned post)</span>' }); });
    var tagName = { camp: "Campaign", post: "Post", film: "Film" };
    var monthHtml = '<div class="months">' + months.map(function (items, m) {
      items.sort(function (a, b) { return (a.t === "camp" ? -1 : 0) - (b.t === "camp" ? -1 : 0) || String(a.d).localeCompare(String(b.d)); });
      var shown = items.slice(0, 8);
      return '<div class="month card"><h3>' + MONTHS[m] + ' ' + year + '<span class="muted small">' + items.length + ' item' + (items.length === 1 ? "" : "s") + '</span></h3>' +
        (items.length ? '<ul>' + shown.map(function (x) { return '<li><span class="tag tag-' + x.t + '">' + tagName[x.t] + '</span><span>' + x.html + '</span></li>'; }).join("") + (items.length > 8 ? '<li class="muted small">+ ' + (items.length - 8) + ' more</li>' : "") + '</ul>' : '<p class="muted small" style="margin:0">Nothing scheduled yet.</p>') + '</div>';
    }).join("") + '</div>';

    var q = r.q;
    var fStore = uniq(lib.map(function (c) { return c.Showroom; })), fType = uniq(lib.map(function (c) { return c["Campaign Type"]; })), fRec = uniq(lib.map(function (c) { return c.Recommendation; }));
    function sel(id, label, vals) { return '<select class="f" id="' + id + '"><option value="">' + label + ': all</option>' + vals.map(function (v) { return '<option' + (q[id] === v ? " selected" : "") + '>' + esc(v) + '</option>'; }).join("") + '</select>'; }

    app.innerHTML = '<div class="page-head"><div><div class="eyebrow">Marketing calendar</div><h1>2027 Campaigns</h1><p>The ' + camps.length + ' planned campaigns for ' + year + ', what\'s scheduled each month, and the full ' + lib.length + '-idea campaign library.</p></div></div>' +
      '<div class="section" style="margin-top:0"><h2>Planned campaigns</h2>' + gantt + '</div>' +
      '<div class="section"><h2>Campaign details</h2><div class="table-wrap"><table class="t"><thead><tr><th>ID</th><th>Campaign</th><th>Showroom</th><th>Dates</th><th>Priority</th><th>Goal / KPI</th><th>Headline</th><th>Deliverables</th><th>Notes</th></tr></thead><tbody>' +
      camps.map(function (c) { return '<tr><td>' + esc(c.ID) + '</td><td><strong>' + esc(c.Campaign) + '</strong><br><span class="muted small">' + esc(c.Type) + ' • ' + esc(c.Status) + '</span></td><td>' + esc(c.Showroom) + '</td><td style="white-space:nowrap">' + fmtShort(c.Start) + ' – ' + fmtShort(c.End) + '</td><td>' + esc(c.Priority) + '</td><td>' + esc(c["Goal / KPI"]) + '</td><td>' + esc(c.Headline) + '</td><td class="small">' + esc(c.Deliverables) + '</td><td class="small">' + esc(c["Details / Notes"]) + '</td></tr>'; }).join("") +
      '</tbody></table></div></div>' +
      '<div class="section"><h2>Month by month</h2><p class="muted small" style="margin-top:-6px">Campaigns, planned filming dates and scheduled posts, pulled from the workbook.</p>' + monthHtml + '</div>' +
      '<div class="section"><h2>Campaign idea library</h2><div class="filters card"><div class="filter-row"><div class="search"><input id="lq" type="search" placeholder="Search campaign ideas…" value="' + esc(q.lq || "") + '"></div>' +
      sel("ls", "Showroom", fStore) + sel("lt", "Type", fType) + sel("lr", "Recommendation", fRec) + '</div></div><div class="result-bar"><strong id="lcount"></strong></div><div class="lib" id="lib"></div></div>' +
      '<div class="tip" id="tip"></div>';

    function renderLib() {
      var term = (q.lq || "").toLowerCase();
      var list = lib.filter(function (c) {
        if (q.ls && c.Showroom !== q.ls) return false; if (q.lt && c["Campaign Type"] !== q.lt) return false; if (q.lr && c.Recommendation !== q.lr) return false;
        if (term && JSON.stringify(c).toLowerCase().indexOf(term) < 0) return false; return true;
      });
      $("#lcount").textContent = list.length + " campaign idea" + (list.length === 1 ? "" : "s");
      var full = list.length;
      if (!renderLib.all && !term && !q.ls && !q.lt && !q.lr) list = list.slice(0, 12);
      $("#lib").innerHTML = list.map(function (c) {
        var feat = /FEATURED/i.test(c.Recommendation);
        return '<div class="card"' + (feat ? ' style="border-top:4px solid var(--red)"' : "") + '><div class="row"><span class="idea-id">' + esc(c["Idea ID"]) + '</span><span class="chip chip-dark">' + esc(c.Showroom) + '</span><span class="chip">' + esc(c["Campaign Type"]) + '</span>' + (feat ? '<span class="chip chip-red">Featured</span>' : "") + '</div>' +
          '<h3>' + esc(c["Campaign / Idea"]) + '</h3><div class="muted small">' + fmtShort(c["Suggested Start"]) + ' – ' + fmtShort(c["Suggested End"]) + ' • ' + esc(c.Posts) + ' posts • ' + esc(c["Videos / Reels"]) + ' videos • ' + esc(c.Graphics) + ' graphics</div>' +
          '<p>' + esc(c["Campaign Pitch / Engagement"]) + '</p><details><summary class="small" style="cursor:pointer;font-weight:600">More details</summary><dl class="kv small" style="margin-top:8px"><dt>Recommendation</dt><dd>' + esc(c.Recommendation) + '</dd><dt>Timing</dt><dd>' + esc(c["Timing Model"]) + '</dd><dt>Supplies / approvals</dt><dd>' + esc(c["Supplies / Partners / Approvals"]) + '</dd><dt>Distribution</dt><dd>' + esc(c.Distribution) + '</dd></dl></details></div>';
      }).join("") + (list.length < full ? '<div style="grid-column:1/-1;text-align:center"><button class="btn btn-dark" id="libMore">Show all ' + full + ' campaign ideas</button></div>' : "") || '<div class="empty card" style="grid-column:1/-1">No campaign ideas match.</div>';
      var mb = $("#libMore"); if (mb) mb.onclick = function () { renderLib.all = true; renderLib(); };
    }
    function push() { route._keepScroll = true; history.replaceState(null, "", "#/campaigns" + qs(q)); renderLib(); }
    ["ls", "lt", "lr"].forEach(function (id) { $("#" + id).onchange = function () { q[id] = this.value; push(); }; });
    var t; $("#lq").oninput = function (e) { clearTimeout(t); t = setTimeout(function () { q.lq = e.target.value; push(); }, 150); };
    renderLib();
    var tip = $("#tip");
    $$(".g-bar").forEach(function (b) {
      var c = camps[+b.getAttribute("data-c")];
      var html = '<strong>' + esc(c.Campaign) + '</strong><br>' + fmtDate(c.Start) + ' – ' + fmtDate(c.End) + '<br>' + esc(c.Showroom) + ' • ' + esc(c.Priority) + ' priority<br>' + esc(c.Headline);
      function show(e) { tip.innerHTML = html; tip.style.display = "block"; var bx = b.getBoundingClientRect(), x = e && e.clientX ? e.clientX : bx.left + bx.width / 2; tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 10, Math.max(10, x - tip.offsetWidth / 2)) + "px"; tip.style.top = (bx.top - tip.offsetHeight - 8) + "px"; }
      b.onmousemove = show; b.onfocus = show; b.onclick = show; b.onmouseleave = b.onblur = function () { tip.style.display = "none"; };
    });
  }

  /* ================= DASHBOARD ================= */
  function hbars(pairs, max) {
    max = max || Math.max.apply(null, pairs.map(function (p) { return p[1]; }).concat([1]));
    return '<div class="hbars">' + pairs.map(function (p) { return '<div class="hbar" title="' + esc(p[0] + ": " + p[1]) + '"><span>' + esc(p[0]) + '</span><div class="track"><div class="fill" style="width:' + (p[1] / max * 100) + '%"></div></div><span class="val">' + fmtNum(p[1]) + '</span></div>'; }).join("") + '</div>';
  }
  function countBy(list, f) { var m = {}; list.forEach(function (i) { var k = typeof f === "function" ? f(i) : i[f]; if (k) m[k] = (m[k] || 0) + 1; }); return m; }
  function viewDashboard() {
    setActive("dashboard");
    var showrooms = STORES.concat(["Universal"]), depts = ["Sales", "Parts", "Service", "Marketing"];
    var tot = { n: 0 }; depts.forEach(function (d) { tot[d] = 0; });
    var libRows = showrooms.map(function (s) {
      var l = ideas.filter(function (i) { return i.Showroom === s; }), r = { s: s, n: l.length };
      depts.forEach(function (d) { r[d] = l.filter(function (i) { return i.Department === d; }).length; tot[d] += r[d]; }); tot.n += l.length; return r;
    });
    function psCell(r) { var p = r.n ? (r.Parts + r.Service) / r.n : 0; return '<td><div class="bar-cell"><div class="bar-track"><div class="bar-fill" style="width:' + p * 100 + '%"></div></div><span>' + Math.round(p * 100) + '%</span></div></td>'; }
    var statusCount = countBy(ideas, function (i) { return i["Production Status"] || "Idea"; });
    var posted = (D.placements || []).filter(function (p) { return p.Status === "Posted"; });
    var planned = (D.placements || []).filter(function (p) { return p.Status !== "Posted" && p.Status !== "Skipped"; });
    var sample = (D.placements || []).some(function (p) { return p["Sample?"] === "Yes"; });
    var pages = (S.lists && S.lists.Pages || []).filter(function (p) { return p !== "Other"; });
    var perf = pages.map(function (pg) {
      var l = posted.filter(function (p) { return p["Page / Account"] === pg; });
      var sum = function (k) { return l.reduce(function (s, p) { return s + num(p[k]); }, 0); };
      return { pg: pg, n: l.length, views: sum("Views"), eng: sum("Engagements"), leads: sum("Leads / Inquiries"), appts: sum("Service Appts"), sched: planned.filter(function (p) { return p["Page / Account"] === pg; }).length };
    });
    var top = ideas.filter(function (i) { return num(i["Total Views"]) > 0; }).sort(function (a, b) { return num(b["Total Views"]) - num(a["Total Views"]); });
    var topPS = top.filter(function (i) { return i.Department === "Parts" || i.Department === "Service"; });
    function topTable(l) { return l.length ? '<div class="table-wrap"><table class="t"><thead><tr><th>#</th><th>Idea</th><th>Showroom</th><th class="num">Views</th></tr></thead><tbody>' + l.slice(0, 5).map(function (i, k) { return '<tr><td>' + (k + 1) + '</td><td><a href="#/idea/' + esc(i.ID) + '">' + esc(i.Title) + '</a> <span class="muted small">' + esc(i.ID) + '</span></td><td>' + esc(storeLabel(i)) + '</td><td class="num">' + fmtNum(num(i["Total Views"])) + '</td></tr>'; }).join("") + '</tbody></table></div>' : '<div class="card panel muted small">No views logged yet. This fills in once posts have numbers in the PLACEMENTS sheet.</div>'; }
    var inProd = ["Talent Scheduled", "Filmed", "Editing", "In Review", "Ready to Post"].reduce(function (s, k) { return s + (statusCount[k] || 0); }, 0);
    var totalViews = posted.reduce(function (s, p) { return s + num(p.Views); }, 0);
    var byPillar = countBy(ideas, "Content Pillar"), bySeason = countBy(ideas, "Season");
    var seasonOrder = (S.lists && S.lists.Seasons) || Object.keys(bySeason);

    app.innerHTML = '<div class="page-head"><div><div class="eyebrow">For managers</div><h1>Production Dashboard</h1><p>Where the 2027 video program stands: what\'s in the library, what\'s moving through production, and how posts are performing. Updated ' + fmtDate((D.generated || "").slice(0, 10)) + '.</p></div></div>' +
      '<div class="stats">' +
      '<div class="stat card"><div class="num">' + ideas.length + '</div><div class="lbl">Ideas in library</div></div>' +
      '<div class="stat card"><div class="num">' + Math.round((tot.Parts + tot.Service) / Math.max(1, tot.n) * 100) + '%</div><div class="lbl">Parts + Service share</div></div>' +
      '<div class="stat card"><div class="num">' + inProd + '</div><div class="lbl">In production</div></div>' +
      '<div class="stat card"><div class="num">' + (statusCount.Posted || 0) + '</div><div class="lbl">Ideas posted</div></div>' +
      '<div class="stat card"><div class="num">' + planned.length + '</div><div class="lbl">Posts scheduled</div></div>' +
      '<div class="stat card"><div class="num">' + fmtNum(totalViews) + '</div><div class="lbl">Views (posted)</div></div></div>' +
      (sample ? '<p class="callout small">The publishing numbers below include the workbook\'s SAMPLE rows. Set “Include SAMPLE rows in dashboard?” to No in SETTINGS (or delete the sample rows) once real posts are logged.</p>' : "") +
      '<div class="section"><h2>Content library by showroom</h2><div class="table-wrap"><table class="t"><thead><tr><th>Showroom</th><th class="num">Ideas</th>' + depts.map(function (d) { return '<th class="num">' + d + '</th>'; }).join("") + '<th>Parts + Service %</th></tr></thead><tbody>' +
      libRows.map(function (r) { return '<tr><td><a href="#/ideas?store=' + encodeURIComponent(r.s === "Universal" ? "Company-wide" : r.s) + (r.s === "Universal" ? "" : "&local=1") + '">' + esc(r.s === "Universal" ? "Company-wide (Universal)" : r.s) + '</a></td><td class="num">' + r.n + '</td>' + depts.map(function (d) { return '<td class="num">' + r[d] + '</td>'; }).join("") + psCell(r) + '</tr>'; }).join("") +
      '<tr class="total"><td>Total</td><td class="num">' + tot.n + '</td>' + depts.map(function (d) { return '<td class="num">' + tot[d] + '</td>'; }).join("") + psCell(tot) + '</tr></tbody></table></div></div>' +
      '<div class="section"><h2>Production pipeline</h2><div class="table-wrap"><table class="t"><thead><tr><th>Status</th>' + showrooms.map(function (s) { return '<th class="num">' + esc(s) + '</th>'; }).join("") + '<th class="num">Total</th></tr></thead><tbody>' +
      PROD_ORDER.map(function (st) { var all = 0; var cells = showrooms.map(function (s) { var n = ideas.filter(function (i) { return i.Showroom === s && (i["Production Status"] || "Idea") === st; }).length; all += n; return '<td class="num">' + (n || '<span class="muted">0</span>') + '</td>'; }).join(""); return '<tr><td>' + esc(st) + '</td>' + cells + '<td class="num"><strong>' + all + '</strong></td></tr>'; }).join("") +
      '</tbody></table></div></div>' +
      '<div class="section grid-2"><div><h2 style="margin-bottom:12px">Ideas by content type</h2><div class="card panel">' + hbars(Object.keys(byPillar).sort(function (a, b) { return byPillar[b] - byPillar[a]; }).map(function (k) { return [k, byPillar[k]]; })) + '</div></div>' +
      '<div><h2 style="margin-bottom:12px">Ideas by season</h2><div class="card panel">' + hbars(seasonOrder.filter(function (k) { return bySeason[k]; }).map(function (k) { return [k, bySeason[k]]; })) + '</div></div></div>' +
      '<div class="section"><h2>Performance by page</h2><div class="table-wrap"><table class="t"><thead><tr><th>Page / account</th><th class="num">Scheduled</th><th class="num">Posted</th><th class="num">Views</th><th class="num">Engagements</th><th class="num">Leads</th><th class="num">Service appts</th><th class="num">Views per post</th></tr></thead><tbody>' +
      perf.map(function (p) { return '<tr><td>' + esc(p.pg) + '</td><td class="num">' + p.sched + '</td><td class="num">' + p.n + '</td><td class="num">' + fmtNum(p.views) + '</td><td class="num">' + fmtNum(p.eng) + '</td><td class="num">' + fmtNum(p.leads) + '</td><td class="num">' + fmtNum(p.appts) + '</td><td class="num">' + (p.n ? fmtNum(p.views / p.n) : "—") + '</td></tr>'; }).join("") +
      '</tbody></table></div></div>' +
      '<div class="section grid-2"><div><h2 style="margin-bottom:12px">Best-performing ideas</h2>' + topTable(top) + '</div><div><h2 style="margin-bottom:12px">Strongest Parts &amp; Service content</h2>' + topTable(topPS) + '</div></div>';
  }

  /* ================= STORES & GUIDE ================= */
  function viewStores() {
    setActive("stores");
    var prof = {}; (D.showrooms || []).forEach(function (s) { prof[s.name] = s; });
    app.innerHTML = '<div class="page-head"><div><div class="eyebrow">Stores &amp; how it works</div><h1>Showrooms &amp; Guide</h1><p>Store details, the creative direction for each showroom, and how talent and managers use this site.</p></div></div>' +
      '<div class="grid-2"><div class="card panel"><h3>For talent: how to pick a video</h3><ol class="steps">' +
      '<li><span><strong>Open the Idea Catalog</strong> and tap your showroom. Company-wide ideas that fit your store are included.</span></li>' +
      '<li><span><strong>Filter</strong> by your department (Sales, Parts, Service) or search for a machine you know well.</span></li>' +
      '<li><span><strong>Open an idea</strong> to read the hook, the questions you\'ll answer, and the shots. Look for the green “Open to record” badge.</span></li>' +
      '<li><span><strong>Tap “I want to record this.”</strong> Add your name and when you\'re free, then send the email. ' + esc(C.contactName || "Marketing") + ' will confirm a filming date.</span></li>' +
      '<li><span><strong>Got your own idea?</strong> Tap <a href="#" data-idea-btn>💡 I have an idea</a> at the top of any page and send it in.</span></li></ol></div>' +
      '<div class="card panel"><h3>For managers</h3><ol class="steps">' +
      '<li><span><strong>Dashboard</strong> shows ideas per store, the Parts + Service share, the production pipeline and post performance.</span></li>' +
      '<li><span><strong>2027 Campaigns</strong> shows the planned campaigns on a timeline, what\'s scheduled each month, and the full campaign idea library.</span></li>' +
      '<li><span><strong>Share a filtered list</strong>: set filters in the catalog and use “Copy link to this view” (e.g. every open Service idea for Lodi).</span></li>' +
      '<li><span>The site updates whenever marketing uploads the latest workbook.</span></li></ol></div></div>' +
      '<div class="section"><h2>Showrooms</h2><div class="grid-2">' + STORES.map(function (n) {
        var s = storeInfo(n) || {}, p = prof[n] || {};
        return '<div class="card store"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap"><h2>' + esc(n) + '</h2><a class="btn btn-sm" href="#/ideas?store=' + encodeURIComponent(n) + '">See ' + ideas.filter(function (i) { return fitsStore(i, n); }).length + ' ideas →</a></div>' +
          '<dl class="kv"><dt>Address</dt><dd>' + esc(s.Address) + '</dd><dt>Phone</dt><dd>' + esc(s.Phone) + '</dd><dt>Hours</dt><dd>' + esc(s.Hours) + '</dd><dt>Serves</dt><dd>' + esc(s["Areas Served (per website)"]) + '</dd></dl>' +
          '<div class="brands">' + String(s["Brands Carried Here"] || "").split(/,\s*/).filter(Boolean).map(function (b) { return '<span class="chip">' + esc(b) + '</span>'; }).join("") + '</div>' +
          field("Audience / market", p.audience) + field("Creative direction", p.direction) + field("Parts & service opportunities", p.partsService) + '</div>';
      }).join("") + '</div>' + (prof.Universal ? '<div class="card panel" style="margin-top:16px"><h3>Company-wide (Universal) ideas</h3><p style="margin:0">' + esc(prof.Universal.confirmed) + '</p></div>' : "") + '</div>' +
      (D.groundRules && D.groundRules.length ? '<div class="section"><h2>Ground rules</h2><div class="card panel"><ul class="rules">' + D.groundRules.map(function (g) { return "<li>" + esc(g) + "</li>"; }).join("") + '</ul></div></div>' : "");
  }

  /* ================= OWNER SIGN-IN ================= */
  function viewOwner() {
    setActive("");
    if (isOwner()) {
      app.innerHTML = '<div class="narrow card panel"><div class="eyebrow">Owner</div><h1>You\'re signed in</h1><p>On this device you can see the <strong>Cardboard AI prompt</strong> on every idea and your <strong>Brain Dump</strong>.</p>' +
        (C.ownerPasscodeHash ? "" : '<p class="callout small">Your passcode isn\'t saved in <code>js/config.js</code> yet, so this sign-in only works on this device until you add it. Set it up again below to get the line to paste.</p>') +
        '<div class="detail-actions"><a class="btn btn-primary" href="#/brain">🧠 Open Brain Dump</a><button class="btn" id="signOut">Sign out</button>' + (C.ownerPasscodeHash ? "" : '<button class="btn" id="redo">Set up passcode</button>') + '</div></div>';
      $("#signOut").onclick = function () { store.set("owner", ""); applyOwner(); toast("Signed out"); viewOwner(); };
      var rd = $("#redo"); if (rd) rd.onclick = function () { store.set("owner", ""); applyOwner(); viewOwner(); };
      return;
    }
    if (!C.ownerPasscodeHash) {
      app.innerHTML = '<div class="narrow card panel"><div class="eyebrow">Owner • one-time setup</div><h1>Create your passcode</h1>' +
        '<p>This passcode opens the owner-only sections (Cardboard prompts and Brain Dump). Pick something only you know.</p>' +
        '<form class="form-grid" id="setForm"><label>New passcode<input class="f" type="password" name="a" required minlength="6" autocomplete="new-password"></label><label>Type it again<input class="f" type="password" name="b" required autocomplete="new-password"></label><div><button class="btn btn-primary">Create</button></div></form><div id="setOut"></div></div>';
      $("#setForm").onsubmit = function (e) {
        e.preventDefault();
        var a = this.elements.a.value, b = this.elements.b.value;
        if (a !== b) { toast("The two passcodes don't match"); return; }
        var h = hashPass(a), line = 'ownerPasscodeHash: "' + h + '",';
        store.set("owner", "pending:" + h); applyOwner();
        $("#setOut").innerHTML = '<div class="section"><h3>Last step: save it to the site</h3><ol class="steps" style="margin-top:10px">' +
          '<li><span>On GitHub, open <strong>js/config.js</strong> and click the pencil (Edit).</span></li>' +
          '<li><span>Paste this line on its own line, right under the <code>contactEmail</code> line. If there\'s already an <code>ownerPasscodeHash</code> line, replace it:<br><code class="code-line" id="hashLine">' + esc(line) + '</code><br><button class="btn btn-sm" id="copyHash" type="button" style="margin-top:6px">Copy line</button></span></li>' +
          '<li><span>Click <strong>Commit changes</strong>. After about a minute, your passcode works on any device: phone, laptop, work computer.</span></li></ol>' +
          '<p class="muted small">You\'re signed in on this device now. The line is scrambled, so your actual passcode never goes on GitHub.</p></div>';
        $("#copyHash").onclick = function () { copyText(line, "Line copied"); };
      };
      return;
    }
    app.innerHTML = '<div class="narrow card panel"><div class="eyebrow">Owner</div><h1>Sign in</h1><p class="muted">For the site owner only.</p>' +
      '<form class="form-grid" id="inForm"><label>Passcode<input class="f" type="password" name="p" required autocomplete="current-password"></label><div><button class="btn btn-primary">Sign in</button></div></form></div>';
    $("#inForm").onsubmit = function (e) {
      e.preventDefault();
      if (hashPass(this.elements.p.value) === C.ownerPasscodeHash) { store.set("owner", C.ownerPasscodeHash); applyOwner(); toast("Signed in"); location.hash = "#/brain"; }
      else { toast("That passcode isn't right"); this.elements.p.value = ""; }
    };
  }

  /* ================= BRAIN DUMP (owner only, saved in this browser) ================= */
  var BD_TAGS = ["Video idea", "Campaign", "To-do", "Talent", "Note"];
  function viewBrain(r) {
    setActive("brain");
    if (!isOwner()) { location.replace("#/owner"); return; }
    var notes = store.get("brain", []), q = { text: "", tag: "", done: false }, editing = null;
    function save() { store.set("brain", notes); }
    function stamp(t) { var d = new Date(t); return MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
    function tagOpts(sel, all) { return (all ? '<option value="">All</option>' : "") + BD_TAGS.map(function (t) { return '<option' + (t === sel ? " selected" : "") + '>' + t + '</option>'; }).join(""); }

    app.innerHTML = '<div class="page-head"><div><div class="eyebrow">🔒 Only you can see this</div><h1>Brain Dump</h1><p>Get it out of your head: video ideas, campaign thoughts, to-dos, talent notes. Press <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd> to save.</p></div>' +
      '<div class="detail-actions"><button class="btn btn-sm" id="bdExport">⬇ Back up</button><label class="btn btn-sm" style="cursor:pointer">⬆ Restore<input type="file" id="bdImport" accept=".json" hidden></label><button class="btn btn-sm" id="bdCopy">Copy all as text</button></div></div>' +
      '<div class="card panel bd-compose"><textarea class="f" id="bdText" rows="3" placeholder="What\'s on your mind?"></textarea>' +
      '<div class="filter-row"><select class="f" id="bdTag" style="flex:0 0 auto">' + tagOpts("Video idea") + '</select><input class="f" id="bdLink" placeholder="Related idea ID (optional), e.g. V-LOD-014" list="bdIds" style="flex:1 1 220px"><datalist id="bdIds">' + ideas.map(function (i) { return '<option value="' + esc(i.ID) + '">' + esc(i.Title) + '</option>'; }).join("") + '</datalist><button class="btn btn-primary" id="bdAdd">Save</button></div></div>' +
      '<div class="filter-row" style="margin:16px 0 10px"><div class="search"><input id="bdQ" type="search" placeholder="Search your notes"></div><select class="f" id="bdF" style="flex:0 0 auto">' + tagOpts("", true) + '</select><label class="check"><input type="checkbox" id="bdDone"> Show done</label></div>' +
      '<div id="bdList" class="bd-list"></div>' +
      '<p class="muted small" style="margin-top:18px">Notes are saved in this browser on this device only. They never go to GitHub and nobody else can see them. Use <strong>Back up</strong> now and then, and <strong>Restore</strong> to move them to another computer.</p>';

    function render() {
      var term = q.text.toLowerCase();
      var list = notes.filter(function (n) { return (q.done || !n.done) && (!q.tag || n.tag === q.tag) && (!term || (n.text + " " + (n.link || "")).toLowerCase().indexOf(term) >= 0); })
        .sort(function (a, b) { return (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.t - a.t; });
      $("#bdList").innerHTML = list.length ? list.map(function (n) {
        var linked = n.link && byId[n.link];
        if (editing === n.id) return '<div class="card bd-note"><textarea class="f" id="bdEditText" rows="4">' + esc(n.text) + '</textarea><div class="filter-row" style="margin-top:8px"><select class="f" id="bdEditTag" style="flex:0 0 auto">' + tagOpts(n.tag) + '</select><button class="btn btn-sm btn-primary" data-bd="saveEdit" data-id="' + n.id + '">Save</button><button class="btn btn-sm btn-ghost" data-bd="cancel" data-id="' + n.id + '">Cancel</button></div></div>';
        return '<div class="card bd-note' + (n.done ? " done" : "") + (n.pin ? " pinned" : "") + '"><div class="bd-meta"><span class="chip chip-red">' + esc(n.tag) + '</span>' + (n.pin ? '<span class="chip chip-dark">📌 Pinned</span>' : "") +
          (linked ? '<a class="chip" href="#/idea/' + esc(n.link) + '">' + esc(n.link) + ' · ' + esc(linked.Title) + '</a>' : (n.link ? '<span class="chip">' + esc(n.link) + '</span>' : "")) + '<span class="muted small">' + stamp(n.t) + '</span></div>' +
          '<div class="bd-text">' + esc(n.text) + '</div><div class="bd-actions">' +
          '<button class="btn btn-sm btn-ghost" data-bd="done" data-id="' + n.id + '">' + (n.done ? "↺ Not done" : "✓ Done") + '</button><button class="btn btn-sm btn-ghost" data-bd="pin" data-id="' + n.id + '">' + (n.pin ? "Unpin" : "📌 Pin") + '</button>' +
          '<button class="btn btn-sm btn-ghost" data-bd="edit" data-id="' + n.id + '">Edit</button><button class="btn btn-sm btn-ghost" data-bd="del" data-id="' + n.id + '">Delete</button></div></div>';
      }).join("") : '<div class="empty card">' + (notes.length ? "Nothing matches." : "Nothing here yet. Your first thought goes in the box above.") + '</div>';
      var ta = $("#bdEditText"); if (ta) ta.focus();
    }
    function add() {
      var t = $("#bdText").value.trim(); if (!t) return;
      notes.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: Date.now(), text: t, tag: $("#bdTag").value, link: $("#bdLink").value.trim().toUpperCase(), pin: false, done: false });
      save(); $("#bdText").value = ""; $("#bdLink").value = ""; render(); $("#bdText").focus(); toast("Saved");
    }
    $("#bdAdd").onclick = add;
    $("#bdText").onkeydown = function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) add(); };
    $("#bdQ").oninput = function () { q.text = this.value; render(); };
    $("#bdF").onchange = function () { q.tag = this.value; render(); };
    $("#bdDone").onchange = function () { q.done = this.checked; render(); };
    $("#bdList").onclick = function (e) {
      var b = e.target.closest("[data-bd]"); if (!b) return;
      var id = b.getAttribute("data-id"), n = notes.filter(function (x) { return x.id === id; })[0], act = b.getAttribute("data-bd"); if (!n) return;
      if (act === "done") n.done = !n.done;
      else if (act === "pin") n.pin = !n.pin;
      else if (act === "edit") editing = id;
      else if (act === "cancel") editing = null;
      else if (act === "saveEdit") { var v = $("#bdEditText").value.trim(); if (v) { n.text = v; n.tag = $("#bdEditTag").value; } editing = null; }
      else if (act === "del") { if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Click again to delete"; return; } notes = notes.filter(function (x) { return x.id !== id; }); }
      save(); render();
    };
    $("#bdExport").onclick = function () {
      var blob = new Blob([JSON.stringify({ app: "jkps-brain-dump", saved: new Date().toISOString(), notes: notes }, null, 2)], { type: "application/json" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "brain-dump-" + new Date().toISOString().slice(0, 10) + ".json"; document.body.appendChild(a); a.click(); a.remove();
    };
    $("#bdImport").onchange = function () {
      var f = this.files[0]; if (!f) return; var fr = new FileReader();
      fr.onload = function () {
        try { var d = JSON.parse(fr.result), inc = Array.isArray(d) ? d : d.notes; if (!Array.isArray(inc)) throw 0;
          var have = {}; notes.forEach(function (n) { have[n.id] = 1; }); var added = 0;
          inc.forEach(function (n) { if (n && n.id && n.text && !have[n.id]) { notes.push(n); added++; } });
          save(); render(); toast("Restored " + added + " note" + (added === 1 ? "" : "s"));
        } catch (e) { toast("That file isn't a Brain Dump backup"); }
      };
      fr.readAsText(f); this.value = "";
    };
    $("#bdCopy").onclick = function () { copyText(notes.filter(function (n) { return !n.done; }).map(function (n) { return "[" + n.tag + "] " + n.text + (n.link ? " (" + n.link + ")" : ""); }).join("\n\n") || "(empty)", "Copied"); };
    render();
  }

  /* ---------------- boot ---------------- */
  if (C.siteTitle) { $("#siteTitle").textContent = C.siteTitle; document.title = C.siteTitle; }
  if (C.siteSubtitle) $("#siteSub").textContent = C.siteSubtitle;
  $("#dataStamp").textContent = "Content updated " + fmtDate((D.generated || "").slice(0, 10)) + " • " + ideas.length + " ideas";
  savePicks();
  applyOwner();
  route();
})();
