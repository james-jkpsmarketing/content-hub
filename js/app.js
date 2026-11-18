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
  var STORES = (S.lists && S.lists.Showrooms ? S.lists.Showrooms : ["Niles", "Elyria", "Lodi", "Bedford Heights", "Universal"]).filter(function (s) { return s !== "Universal"; });
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
  function requestModal(ids) {
    var list = ids.map(function (id) { return byId[id]; }).filter(Boolean);
    if (!list.length) return;
    var me = store.get("me", {});
    var opts = ["", "Niles", "Elyria", "Lodi", "Bedford Heights"].map(function (s) { return '<option' + (me.store === s ? " selected" : "") + ">" + esc(s) + "</option>"; }).join("");
    openModal(
      '<div class="eyebrow">Request to record</div><h2 id="modalTitle">' + (list.length === 1 ? esc(list[0].Title) : list.length + " ideas") + '</h2>' +
      '<p class="muted small">' + list.map(function (i) { return esc(i.ID); }).join(", ") + '</p>' +
      '<form class="form-grid" id="reqForm">' +
      '<label>Your name<input class="f" name="name" required value="' + esc(me.name || "") + '"></label>' +
      '<label>Your role / department<input class="f" name="role" placeholder="e.g. Parts counter, Service tech" value="' + esc(me.role || "") + '"></label>' +
      '<label>Your showroom<select class="f" name="store">' + opts + '</select></label>' +
      '<label>Days / times that work for filming<input class="f" name="when" placeholder="e.g. Tue or Thu mornings in March"></label>' +
      '<label>Anything else? (optional)<textarea class="f" name="notes" rows="3" placeholder="Ideas for a twist, a machine you want to use, etc."></textarea></label>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px"><button class="btn btn-primary" type="submit">✉ Open email to send</button><button class="btn" type="button" id="reqCopy">Copy request text</button></div>' +
      (C.contactEmail ? '<p class="muted small">This opens your email app with everything filled in for ' + esc(C.contactName || "the marketing team") + '. Just press Send.</p>'
        : '<p class="callout small">No contact email is set up for this site yet. Use “Copy request text” and send it to ' + esc(C.contactName || "the marketing team") + ' directly.</p>') +
      '</form>');
    function build() {
      var f = $("#reqForm"), v = function (n) { return f.elements[n].value.trim(); };
      store.set("me", { name: v("name"), role: v("role"), store: v("store") });
      var subject = "Video request: " + (list.length === 1 ? list[0].ID + " – " + list[0].Title : list.length + " ideas") + (v("name") ? " (" + v("name") + ")" : "");
      var body = "Hi " + (C.contactName || "") + ",\n\nI'd like to record " + (list.length === 1 ? "this video idea" : "these video ideas") + ":\n\n" +
        list.map(function (i) { return "• " + i.ID + " – " + i.Title + " (" + storeLabel(i) + ", " + i.Department + ")\n  " + location.href.split("#")[0] + "#/idea/" + i.ID; }).join("\n") +
        "\n\nName: " + v("name") + "\nRole: " + v("role") + "\nShowroom: " + v("store") + "\nAvailability: " + v("when") + (v("notes") ? "\nNotes: " + v("notes") : "") + "\n\nThanks!";
      return { subject: subject, body: body };
    }
    $("#reqForm").onsubmit = function (e) {
      e.preventDefault();
      var m = build();
      if (!C.contactEmail) { copyText("Subject: " + m.subject + "\n\n" + m.body, "Request copied — paste it into an email or text"); return; }
      var href = "mailto:" + encodeURIComponent(C.contactEmail) + "?subject=" + encodeURIComponent(m.subject) + (C.ccEmail ? "&cc=" + encodeURIComponent(C.ccEmail) : "") + "&body=" + encodeURIComponent(m.body);
      window.location.href = href;
      setTimeout(function () { $("#modalBody").innerHTML = '<div class="eyebrow">Almost done</div><h2>Check your email app</h2><p>Your request should be open in a new email. Press <strong>Send</strong>. If nothing opened, copy the request instead and send it to ' + esc(C.contactEmail) + '.</p><button class="btn" id="reqCopy2">Copy request text</button>'; $("#reqCopy2").onclick = function () { copyText("To: " + C.contactEmail + "\nSubject: " + m.subject + "\n\n" + m.body, "Request copied"); }; }, 400);
    };
    $("#reqCopy").onclick = function () { var m = build(); copyText((C.contactEmail ? "To: " + C.contactEmail + "\n" : "") + "Subject: " + m.subject + "\n\n" + m.body, "Request copied"); };
  }

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
    var views = { "": viewIdeas, ideas: viewIdeas, idea: viewIdea, picks: viewPicks, plan: viewPlan, campaigns: viewCampaigns, dashboard: viewDashboard, stores: viewStores, print: viewPrint };
    (views[p] || viewIdeas)(r);
    if (!route._keepScroll) window.scrollTo(0, 0);
    route._keepScroll = false;
  }
  window.addEventListener("hashchange", route);
  $("#menuBtn").onclick = function () { var n = $("#nav"); n.classList.toggle("open"); this.setAttribute("aria-expanded", n.classList.contains("open")); };

  /* ================= IDEA CATALOG ================= */
  var FILTERS = [
    ["dept", "Department", "Department"], ["pillar", "Content Pillar", "Content type"], ["season", "Season", "Season"],
    ["diff", "Difficulty", "Difficulty"], ["prio", "Priority", "Priority"], ["talent", "Talent", "Who's on camera"], ["area", "Suggested Showroom Area", "Filming area"]
  ];
  function optionList(field) {
    var vals = uniq(ideas.map(function (i) { return i[field]; }));
    var order = { Difficulty: ["Easy", "Medium", "Advanced"], Priority: ["High", "Medium", "Low"], Season: (S.lists && S.lists.Seasons) || [] }[field];
    if (order) vals.sort(function (a, b) { var x = order.indexOf(a), y = order.indexOf(b); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y); });
    else vals.sort();
    return vals;
  }
  function ideaCard(i) {
    var a = availability(i);
    return '<a class="idea card" href="#/idea/' + esc(i.ID) + '">' +
      '<div class="idea-top"><span class="idea-id">' + esc(i.ID) + '</span><span class="badge ' + a.cls + '">' + esc(a.label) + '</span></div>' +
      '<h3>' + esc(i.Title) + '</h3>' +
      '<div class="idea-meta"><span class="chip chip-dark">' + esc(storeLabel(i)) + '</span><span class="chip chip-red">' + esc(i.Department) + '</span><span class="chip">' + esc(i["Content Pillar"]) + '</span></div>' +
      '<p>' + esc(i["The Idea"]) + '</p>' +
      '<div class="idea-foot"><span>' + esc(i.Difficulty) + ' • ~' + esc(i["Est. Film Min"]) + ' min to film • ' + esc(i.Talent) + '</span>' +
      '<button class="pick-btn" data-pick="' + esc(i.ID) + '">' + (picks.indexOf(i.ID) >= 0 ? "★ Picked" : "☆ Pick") + '</button></div></a>';
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
    var pr = { High: 0, Medium: 1, Low: 2 }, df = { Easy: 0, Medium: 1, Advanced: 2 };
    if (q.sort === "prio") list.sort(function (a, b) { return (pr[a.Priority] - pr[b.Priority]) || a.ID.localeCompare(b.ID); });
    else if (q.sort === "easy") list.sort(function (a, b) { return (df[a.Difficulty] - df[b.Difficulty]) || (num(a["Est. Film Min"]) - num(b["Est. Film Min"])); });
    else if (q.sort === "short") list.sort(function (a, b) { return num(a["Est. Film Min"]) - num(b["Est. Film Min"]); });
    return list;
  }
  function qs(q) { var s = Object.keys(q).filter(function (k) { return q[k]; }).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(q[k]); }).join("&"); return s ? "?" + s : ""; }

  function viewIdeas(r) {
    setActive("ideas");
    var q = r.q;
    var open = ideas.filter(function (i) { return availability(i).key === "open"; }).length;
    var ps = ideas.filter(function (i) { return i.Department === "Parts" || i.Department === "Service"; }).length;
    var storeTabs = ["", "Company-wide"].concat(STORES).map(function (s) {
      return '<button class="store-tab' + ((q.store || "") === s ? " active" : "") + '" data-store="' + esc(s) + '">' + (s || "All stores") + '</button>';
    }).join("");
    var selects = FILTERS.map(function (f) {
      return '<select class="f" data-f="' + f[0] + '" aria-label="' + esc(f[2]) + '"><option value="">' + esc(f[2]) + ': all</option>' +
        optionList(f[1]).map(function (v) { return '<option' + (q[f[0]] === v ? " selected" : "") + '>' + esc(v) + '</option>'; }).join("") + '</select>';
    }).join("");
    app.innerHTML =
      '<div class="page-head"><div><div class="eyebrow">2027 video idea catalog</div><h1>Pick a video to record</h1>' +
      '<p>Browse ' + ideas.length + ' ready-to-film ideas for every Johnny K\'s showroom. Open an idea to see the hook, the questions you\'ll answer, and the shots. When you find one you like, hit <strong>I want to record this</strong>.</p></div></div>' +
      '<div class="stats"><div class="stat card"><div class="num">' + ideas.length + '</div><div class="lbl">Video ideas</div></div>' +
      '<div class="stat card"><div class="num">' + open + '</div><div class="lbl">Open to record</div></div>' +
      '<div class="stat card"><div class="num">' + Math.round(ps / ideas.length * 100) + '%</div><div class="lbl">Parts &amp; Service ideas</div></div>' +
      '<div class="stat card"><div class="num">' + ideas.filter(function (i) { return i.Difficulty === "Easy"; }).length + '</div><div class="lbl">Rated “Easy”</div></div></div>' +
      '<div class="filters card no-print">' +
      '<div class="store-tabs">' + storeTabs + '</div>' +
      '<div class="filter-row"><div class="search"><input id="q" type="search" placeholder="Search ideas, machines, hooks… (e.g. Sea-Doo, winter, helmet)" value="' + esc(q.q || "") + '" aria-label="Search ideas"></div>' +
      '<select class="f" data-f="avail" aria-label="Availability"><option value="">Hide dropped</option><option value="open"' + (q.avail === "open" ? " selected" : "") + '>Open to record only</option><option value="taken"' + (q.avail === "taken" ? " selected" : "") + '>Already scheduled / in progress</option><option value="all"' + (q.avail === "all" ? " selected" : "") + '>Show everything</option></select>' +
      '<select class="f" data-f="sort" aria-label="Sort"><option value="">Sort: by ID</option><option value="prio"' + (q.sort === "prio" ? " selected" : "") + '>Priority first</option><option value="easy"' + (q.sort === "easy" ? " selected" : "") + '>Easiest first</option><option value="short"' + (q.sort === "short" ? " selected" : "") + '>Quickest to film</option></select></div>' +
      '<div class="filter-row">' + selects +
      (q.store && q.store !== "Company-wide" ? '<label class="check"><input type="checkbox" id="localOnly"' + (q.local === "1" ? " checked" : "") + '> Only ' + esc(q.store) + '’s own ideas</label>' : "") + '</div></div>' +
      '<div class="result-bar"><strong id="count"></strong><span><button class="btn btn-sm" id="copyView">🔗 Copy link to this view</button> <button class="btn btn-sm btn-ghost" id="clearF">Clear filters</button></span></div>' +
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
    var showroom = i.Scope === "Universal" ? "Universal (compatible: " + i["Compatible Showrooms"] + ")" : i.Showroom;
    var checks = ["Talent confirmed and briefed with 'Explain Video'", "Machine/product on site, clean, correct model verified", "Props gathered (see Prep / Props)", "Releases signed for any customer or minor on camera", "Batteries charged, storage cleared, lav mic tested", "All 5 key film shots captured + B-roll", "Hook recorded 2–3 ways", "Footage logged in FOOTAGE sheet with file location"];
    return '<div class="print-card"><div class="pc"><div class="pc-title">' + esc(i.ID + "  —  " + i.Title) + '</div>' +
      row("The idea", i["The Idea"]) + row("Target time", i["Target Time"]) + row("Opening hook", i["Opening Hook"]) + row("Ask the talent", i["Ask the Talent"]) +
      row("Key film shots", i["Key Film Shots"]) + row("Make it funny", i["Make It Funny"]) + row("Editing notes", i["Editing Notes"]) + row("On-screen words", i["On-Screen Words"]) +
      row("CTA", i.CTA) + row("Suggested area", i["Suggested Showroom Area"]) + row("Showroom", showroom) + row("Talent", i.Talent) + row("Machine", i["Machine / Product"]) +
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
      '<span class="chip chip-dark">' + esc(storeLabel(i)) + '</span><span class="chip chip-red">' + esc(i.Department) + '</span><span class="chip">' + esc(i["Content Pillar"]) + '</span><span class="chip">' + esc(i.Priority) + ' priority</span></div>' +
      '<h1>' + esc(i.Title) + '</h1>' +
      '<div class="detail-actions"><button class="btn btn-primary" id="reqBtn">🎬 I want to record this</button><button class="pick-btn btn" data-pick="' + esc(i.ID) + '"></button>' +
      '<button class="btn" id="printBtn">🖨 Print idea card</button><button class="btn" id="linkBtn">🔗 Copy link</button></div>' +
      '<div class="facts">' + fact("Who's on camera", i.Talent) + fact("Where", i["Suggested Showroom Area"]) + fact("Machine / product", i["Machine / Product"]) + fact("Difficulty", i.Difficulty) +
      fact("Film time", "~" + i["Est. Film Min"] + " min") + fact("Video length", i["Target Time"]) + fact("Format", i["Aspect Ratio"]) + fact("Season", i.Season + " • " + i.Timing) + '</div></div>' +

      '<div class="detail-grid"><div>' +
      '<section class="panel card"><h3><span class="n">1</span>The idea</h3>' + field("What it is", i["The Idea"], "big") +
      '<div class="field"><div class="k">Opening hook (first 3 seconds)</div><div class="hook">' + esc(i["Opening Hook"]) + '</div></div>' +
      field("Alternate hook", i["Alternate Hook"]) + field("How to explain it to the talent", i["Explain Video"]) + '</section>' +

      '<section class="panel card"><h3><span class="n">2</span>For the talent</h3>' + field("Questions you'll answer on camera", i["Ask the Talent"]) + field("Make it funny", i["Make It Funny"]) + field("Prep / props", i["Prep / Props"]) + '</section>' +

      '<section class="panel card"><h3><span class="n">3</span>Shot plan</h3>' + field("Key film shots", i["Key Film Shots"]) + field("Scene-by-scene", i["Scene-by-Scene"]) + field("B-roll", i["B-roll"]) + field("Camera setup", i["Camera Setup"]) + '</section>' +

      '<section class="panel card"><h3><span class="n">4</span>Editing &amp; posting</h3>' + field("Editing notes", i["Editing Notes"]) + field("Pacing", i.Pacing) + field("Transitions", i.Transitions) +
      field("Audio & music", i["Audio & Music"]) + field("Captions / subtitles", i["Captions / Subtitles"]) + field("On-screen words", i["On-Screen Words"]) + field("Call to action", i.CTA) +
      field("Caption idea", i["Caption Idea"]) + field("Hashtags", i.Hashtags) + field("Branding / end card", i["Branding / End Card"]) + field("Repurposing", i.Repurposing) + field("Localization", i["Localization Notes"]) + '</section>' +

      '<details class="panel card" id="cbPanel"><summary><h3 style="margin:0"><span class="n">5</span>Cardboard AI editing prompt</h3></summary><div style="margin-top:12px" class="form-grid">' +
      '<p class="muted small" style="margin:0">Fill in what you have, then copy the prompt into Cardboard and upload your clips there.</p>' +
      '<label>Uploaded file names<input class="f" data-cb="files"></label><label>Best moments / timecodes<input class="f" data-cb="best"></label><label>Do NOT use / cut out<input class="f" data-cb="dont"></label>' +
      '<label>Verified product details or approved offer (optional)<input class="f" data-cb="specs"></label><label>Required disclaimer (optional)<input class="f" data-cb="disc"></label>' +
      '<textarea class="prompt-box" id="cbOut" readonly></textarea><div><button class="btn btn-dark" id="cbCopy">Copy prompt</button></div></div></details>' +
      '</div><aside>' +
      '<section class="panel card"><h3>Strategy</h3><dl class="kv"><dt>Audience</dt><dd>' + esc(i.Audience) + '</dd><dt>Insight</dt><dd>' + esc(i["Audience Insight"]) + '</dd><dt>Objective</dt><dd>' + esc(i.Objective) +
      '</dd><dt>Platforms</dt><dd>' + esc(i.Platforms) + '</dd><dt>Showrooms</dt><dd>' + esc(i["Compatible Showrooms"]) + '</dd></dl></section>' +
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
      '<li><span><strong>Tap “I want to record this.”</strong> Add your name and when you\'re free, then send the email. ' + esc(C.contactName || "Marketing") + ' will confirm a filming date.</span></li></ol></div>' +
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

  /* ---------------- boot ---------------- */
  if (C.siteTitle) { $("#siteTitle").textContent = C.siteTitle; document.title = C.siteTitle; }
  if (C.siteSubtitle) $("#siteSub").textContent = C.siteSubtitle;
  $("#dataStamp").textContent = "Content updated " + fmtDate((D.generated || "").slice(0, 10)) + " • " + ideas.length + " ideas";
  savePicks();
  route();
})();
