/* =====================================================================
   JKPS workbook -> website data
   Reads the content-production Excel file and keeps only what the
   public site needs. Costs, rates, sessions, footage and asset logs,
   internal notes and revenue/profit columns are NOT copied.
   Works in the browser (update.html) and in Node.
   ===================================================================== */
(function (root) {
  "use strict";

  // Columns from IDEA LIBRARY that are left OFF the public site.
  var IDEA_DROP = ["Notes", "Performance Notes", "Rank Helper", "P&S Rank Helper"];
  // Columns from PLACEMENTS that are kept (everything else is dropped).
  var PLACEMENT_KEEP = ["Placement ID", "Asset ID", "Idea ID", "Page / Account", "Platform",
    "Planned Date", "Actual Post Date", "Status", "Post Link", "Views", "Reach", "Engagements",
    "Leads / Inquiries", "Service Appts", "Title", "Sample?"];

  function txt(v) {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return iso(v);
    return String(v).trim();
  }
  function iso(d) {
    if (!(d instanceof Date) || isNaN(d)) return "";
    // SheetJS dates come in as local midnight; use UTC parts after nudging
    var t = new Date(d.getTime() + 12 * 3600 * 1000);
    return t.getUTCFullYear() + "-" + String(t.getUTCMonth() + 1).padStart(2, "0") + "-" +
      String(t.getUTCDate()).padStart(2, "0");
  }
  function val(v) {
    if (v instanceof Date) return iso(v);
    if (typeof v === "number") return v;
    return txt(v);
  }
  function findRow(rows, test, start) {
    for (var i = start || 0; i < rows.length; i++) if (rows[i] && test(rows[i])) return i;
    return -1;
  }
  function isBlankRow(r) {
    return !r || r.every(function (c) { return c === null || c === undefined || txt(c) === ""; });
  }
  // Read a table: header at row h, data until first row with blank first cell
  function table(rows, h, opts) {
    opts = opts || {};
    var head = rows[h].map(txt);
    var out = [];
    for (var i = h + 1; i < rows.length; i++) {
      var r = rows[i] || [];
      if (txt(r[0]) === "") { if (opts.stopAtBlank) break; else continue; }
      if (opts.stopIf && opts.stopIf(r)) break;
      var o = {};
      head.forEach(function (k, j) { if (k) o[k] = val(r[j]); });
      out.push(o);
    }
    return out;
  }
  function sheetRows(XLSX, wb, name) {
    var ws = wb.Sheets[name];
    if (!ws) return null;
    // Turn date-formatted numbers into "YYYY-MM-DD" text (time-zone safe)
    Object.keys(ws).forEach(function (addr) {
      if (addr[0] === "!") return;
      var c = ws[addr];
      if (c && c.t === "n" && c.z && XLSX.SSF.is_date(c.z) && c.v >= 1) {
        var p = XLSX.SSF.parse_date_code(c.v);
        if (p) { c.t = "s"; c.v = p.y + "-" + String(p.m).padStart(2, "0") + "-" + String(p.d).padStart(2, "0"); }
      } else if (c && c.t === "d" && c.v instanceof Date) {
        c.t = "s"; c.v = iso(c.v);
      }
    });
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
  }

  function extract(XLSX, wb) {
    var warnings = [];
    var data = { generated: new Date().toISOString(), ideas: [], campaigns: [], campaignLibrary: [],
      placements: [], settings: {}, showrooms: [], groundRules: [] };

    // ---------- IDEA LIBRARY ----------
    var rows = sheetRows(XLSX, wb, "IDEA LIBRARY");
    if (!rows) throw new Error("Couldn't find the 'IDEA LIBRARY' sheet. Is this the JKPS Content Production workbook?");
    var h = findRow(rows, function (r) { return txt(r[0]) === "ID" && txt(r[1]) === "Title"; });
    if (h < 0) throw new Error("Couldn't find the header row (ID, Title, ...) in IDEA LIBRARY.");
    data.ideas = table(rows, h).map(function (o) {
      IDEA_DROP.forEach(function (k) { delete o[k]; });
      return o;
    }).filter(function (o) { return o.ID && o.Title; });

    // ---------- 2027 CAMPAIGNS ----------
    rows = sheetRows(XLSX, wb, "2027 CAMPAIGNS");
    if (rows) {
      h = findRow(rows, function (r) { return txt(r[0]) === "ID" && txt(r[1]) === "Campaign"; });
      if (h >= 0) data.campaigns = table(rows, h, { stopAtBlank: true });
      h = findRow(rows, function (r) { return txt(r[0]) === "Idea ID" && /Campaign/.test(txt(r[2])); });
      if (h >= 0) data.campaignLibrary = table(rows, h);
    } else warnings.push("No '2027 CAMPAIGNS' sheet found; campaigns left empty.");

    // ---------- SETTINGS ----------
    rows = sheetRows(XLSX, wb, "SETTINGS");
    var s = data.settings;
    s.lists = {}; s.areas = []; s.stores = []; s.buffer = 0.15; s.includeSample = true; s.standards = "";
    if (rows) {
      h = findRow(rows, function (r) { return txt(r[0]) === "Showrooms" && txt(r[1]) === "Departments"; });
      if (h >= 0) {
        var end = findRow(rows, function (r) { return /^FILMING AREAS/.test(txt(r[0])); }, h);
        if (end < 0) end = h + 30;
        rows[h].forEach(function (k, j) {
          k = txt(k); if (!k) return;
          var list = [];
          for (var i = h + 1; i < end; i++) { var v = txt((rows[i] || [])[j]); if (v) list.push(v); }
          s.lists[k] = list;
        });
      }
      h = findRow(rows, function (r) { return txt(r[0]) === "Area" && txt(r[1]) === "Filming Order"; });
      if (h >= 0) s.areas = table(rows, h, { stopAtBlank: true });
      rows.forEach(function (r) {
        var k = txt((r || [])[0]);
        if (/^Filming buffer/i.test(k) && typeof r[1] === "number") s.buffer = r[1];
        if (/^Include SAMPLE/i.test(k)) s.includeSample = txt(r[1]).toLowerCase() !== "no";
        if (/^ALWAYS FOLLOW THESE JKPS EDITING STANDARDS/.test(k)) s.standards = k;
      });
      h = findRow(rows, function (r) { return txt(r[0]) === "Showroom" && txt(r[1]) === "Address"; });
      if (h >= 0) s.stores = table(rows, h, { stopAtBlank: true });
    } else warnings.push("No 'SETTINGS' sheet found; using defaults.");

    // ---------- START HERE (showroom profiles + ground rules) ----------
    rows = sheetRows(XLSX, wb, "START HERE");
    if (rows) {
      h = findRow(rows, function (r) { return txt(r[0]) === "Showroom" && /^Confirmed/.test(txt(r[1])); });
      if (h >= 0) {
        for (var i = h + 1; i < rows.length; i++) {
          var r = rows[i] || [];
          if (txt(r[0]) === "" || /^ASSUMPTIONS/.test(txt(r[0]))) break;
          data.showrooms.push({ name: txt(r[0]), confirmed: txt(r[1]), audience: txt(r[2]),
            direction: txt(r[3]), partsService: txt(r[4]), ideas: txt(r[5]) });
        }
      }
      var a = findRow(rows, function (r) { return /^ASSUMPTIONS & KNOWN LIMITATIONS/.test(txt(r[0])); });
      if (a >= 0) {
        for (var j = a + 1; j < rows.length; j++) {
          var t = txt((rows[j] || [])[0]);
          if (/^SOURCES/.test(t)) break;
          if (t) data.groundRules.push(t.replace(/^•\s*/, ""));
        }
      }
    }

    // ---------- PLACEMENTS (publishing calendar; no $ columns) ----------
    rows = sheetRows(XLSX, wb, "PLACEMENTS");
    if (rows) {
      h = findRow(rows, function (r) { return txt(r[0]) === "Placement ID"; });
      if (h >= 0) {
        data.placements = table(rows, h).map(function (o) {
          var k = {}; PLACEMENT_KEEP.forEach(function (f) { if (f in o) k[f] = o[f]; }); return k;
        }).filter(function (p) { return s.includeSample || p["Sample?"] !== "Yes"; });
      }
    }

    // Store renames for the website (workbook stays as-is)
    data = renameDeep(data);

    data.counts = { ideas: data.ideas.length, campaigns: data.campaigns.length,
      campaignLibrary: data.campaignLibrary.length, placements: data.placements.length };
    return { data: data, warnings: warnings };
  }

  var RENAMES = [[/#BedfordHeights\b/g, "#BedfordOhio"], [/Bedford Heights/g, "Bedford"]];
  function renameDeep(v) {
    if (typeof v === "string") { RENAMES.forEach(function (r) { v = v.replace(r[0], r[1]); }); return v; }
    if (Array.isArray(v)) return v.map(renameDeep);
    if (v && typeof v === "object") { var o = {}; Object.keys(v).forEach(function (k) { o[renameDeep(k)] = renameDeep(v[k]); }); return o; }
    return v;
  }

  function toScript(data) {
    return "/* Generated from the JKPS Content Production workbook on " + data.generated +
      ". Replace this file to update the site (use update.html). */\nwindow.JKPS_DATA = " +
      JSON.stringify(data) + ";\n";
  }

  var api = { extract: extract, toScript: toScript };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.JKPSExtract = api;
})(this);
