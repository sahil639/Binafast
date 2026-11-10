(function () {
  "use strict";
  var I18N = window.BINAFAST_I18N || { en: {}, vi: {} };
  var $ = function (id) { return document.getElementById(id); };
  var CATS = ["hotel", "food", "activity", "transport", "shopping", "other"];
  var STATUSES = ["planned", "booked", "done", "cancelled"];
  var MODES = ["Flight", "Train", "Bus", "Cab", "Ferry", "Bike", "Other"];
  var CAT_ICON = { hotel: "🏨", food: "🍜", activity: "🎟️", transport: "🧭", shopping: "🛍️", other: "📌" };
  var MODE_ICON = { Flight: "✈️", Train: "🚆", Bus: "🚌", Cab: "🚕", Ferry: "⛴️", Bike: "🛵" };
  var HOUR_H = 52;
  var NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,19}$/u;
  var CODE_RE = /^[A-Za-z0-9]{16,40}$/;

  /* ---------- preferences (this device, mirrored to the account) ---------- */
  var DEFAULTS = { theme: "system", lang: "en", time: "24", dayStart: 7, dayEnd: 22, showCancelled: true, autoRead: true };
  function cleanPrefs(p) {
    var o = {}; p = p || {};
    if (["system", "light", "dark"].indexOf(p.theme) >= 0) o.theme = p.theme;
    if (["en", "vi"].indexOf(p.lang) >= 0) o.lang = p.lang;
    if (["24", "12"].indexOf(p.time) >= 0) o.time = p.time;
    if (Number.isInteger(p.dayStart) && p.dayStart >= 0 && p.dayStart <= 12) o.dayStart = p.dayStart;
    if (Number.isInteger(p.dayEnd) && p.dayEnd >= 12 && p.dayEnd <= 24) o.dayEnd = p.dayEnd;
    if (typeof p.showCancelled === "boolean") o.showCancelled = p.showCancelled;
    if (typeof p.autoRead === "boolean") o.autoRead = p.autoRead;
    return o;
  }
  var prefs = (function () {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem("binafast-prefs")); } catch (e) {}
    var p = Object.assign({}, DEFAULTS, cleanPrefs(saved));
    if (!saved && /^vi/i.test(navigator.language || "")) p.lang = "vi";
    return p;
  })();

  function t(key, vars) {
    var s = (I18N[prefs.lang] && I18N[prefs.lang][key]) || (I18N.en && I18N.en[key]) || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }
  function loc() { return prefs.lang === "vi" ? "vi-VN" : "en"; }
  function catName(c) { return t("cat." + (CATS.indexOf(c) >= 0 ? c : "other")); }
  function stName(s) { return t("st." + (STATUSES.indexOf(s) >= 0 ? s : "planned")); }
  function modeName(m) { return MODES.indexOf(m) >= 0 ? t("mode." + m) : (m || ""); }

  function applyStatic() {
    document.documentElement.lang = prefs.lang;
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n]"), function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-ph]"), function (el) { el.placeholder = t(el.getAttribute("data-i18n-ph")); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-aria]"), function (el) { el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria"))); });
    $("days").setAttribute("aria-label", t("f.day"));
    buildFormOptions();
  }
  function applyTheme() {
    var r = document.documentElement;
    if (prefs.theme === "dark" || prefs.theme === "light") r.setAttribute("data-theme", prefs.theme); else r.removeAttribute("data-theme");
  }

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function isDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
  function D(s) { return new Date(s + "T00:00:00Z"); }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function addDays(s, n) { var d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
  function diffDays(a, b) { return Math.round((D(b) - D(a)) / 86400000); }
  function todayISO() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function fmtDay(s, long) {
    return D(s).toLocaleDateString(loc(), long ? { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" } : { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  }
  function mins(s) { var m = /^(\d{2}):(\d{2})$/.exec(s || ""); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  function minToTime(m) { return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }
  function fmtTime(s) {
    var m = mins(s); if (m == null) return "";
    if (prefs.time === "24") return s;
    var h = Math.floor(m / 60), mm = m % 60;
    return ((h + 11) % 12 + 1) + (mm ? ":" + String(mm).padStart(2, "0") : "") + " " + (h < 12 ? "AM" : "PM");
  }
  function fmtHour(h) {
    if (prefs.time === "24") return String(h).padStart(2, "0") + ":00";
    var hh = h % 24; return ((hh + 11) % 12 + 1) + " " + (hh < 12 ? "AM" : "PM");
  }
  function money(n) {
    if (typeof n !== "number" || !isFinite(n)) return "";
    var cur = (trip.currency || "").toUpperCase();
    var digits = Math.abs(n % 1) > 0.004 ? 2 : 0;
    if (/^[A-Z]{3}$/.test(cur)) {
      try { return new Intl.NumberFormat(loc(), { style: "currency", currency: cur, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n); } catch (e) {}
    }
    return n.toLocaleString(loc(), { minimumFractionDigits: digits, maximumFractionDigits: digits }) + (cur ? " " + cur : "");
  }
  function counts(it) { return it.status !== "cancelled" && typeof it.price === "number"; }
  function sum(list) { return list.reduce(function (s, it) { return s + (counts(it) ? it.price : 0); }, 0); }
  function onDay(it, d) { return it.date === d || (isDate(it.date) && isDate(it.endDate) && it.date <= d && d <= it.endDate); }
  function safeUrl(u) { return typeof u === "string" && /^https?:\/\/\S+$/i.test(u.trim()) ? u.trim() : ""; }
  function hue(s) { var h = 0; s = String(s || "?"); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
  function avatar(uid, name, cls) {
    var ch = Array.from(String(name || "?").trim())[0] || "?";
    return '<span class="av' + (cls ? " " + cls : "") + '" style="background:hsl(' + hue(uid || name) + ' 52% 40%)" aria-hidden="true">' + esc(ch.toUpperCase()) + "</span>";
  }
  function toast(text) {
    var el = $("toast"); el.textContent = text; el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 4000);
  }
  function writeFailed(e) {
    var code = e && e.code;
    if (code === "permission-denied") toast(t("e.denied"));
    else if (code === "resource-exhausted") toast(t("e.full"));
    else toast(t("e.nosave"));
  }

  /* ---------- state ---------- */
  var cfg = window.BINAFAST_FIREBASE_CONFIG;
  var configured = !!(cfg && cfg.projectId && cfg.apiKey && !/^PASTE/.test(cfg.apiKey) && window.firebase);
  var auth = null, fs = null, user = null, profile = {}, code = null, unsubs = [];
  var items = [], trip = {}, dayNotes = {}, members = {};
  var ready = { items: false, trip: false };
  var unreachable = false, dead = false;
  var selDay = null;
  var drafts = {}, timers = {}, chains = {};

  function col(name) { return fs.collection("trips").doc(code).collection(name); }
  function tdoc(path) { var p = path.split("/"); return col(p[0]).doc(p[1]); }
  function memberName(uid) { return members[uid] && members[uid].name ? members[uid].name : t("someone"); }

  function allDays() {
    var set = {};
    if (isDate(trip.start) && isDate(trip.end) && trip.end >= trip.start && diffDays(trip.start, trip.end) <= 120) {
      for (var d = trip.start; d <= trip.end; d = addDays(d, 1)) set[d] = 1;
    } else if (isDate(trip.start)) set[trip.start] = 1;
    items.forEach(function (it) { if (isDate(it.date)) set[it.date] = 1; });
    Object.keys(dayNotes).forEach(function (d) { if (isDate(d) && dayNotes[d]) set[d] = 1; });
    return Object.keys(set).sort();
  }
  function dayLabel(d, days) {
    if (isDate(trip.start)) { var n = diffDays(trip.start, d) + 1; return n >= 1 ? t("day.n", { n: n }) : t("day.before"); }
    return t("day.n", { n: days.indexOf(d) + 1 });
  }
  function visibleItems() { return prefs.showCancelled ? items : items.filter(function (it) { return it.status !== "cancelled"; }); }

  /* ---------- rows ---------- */
  function rowHTML(it, opts) {
    opts = opts || {};
    var catKey = CATS.indexOf(it.category) >= 0 ? it.category : "other";
    var icon = catKey === "transport" ? (MODE_ICON[it.mode] || CAT_ICON.transport) : CAT_ICON[catKey];
    var meta = [catName(catKey)];
    if (catKey === "transport") {
      var route = [it.from, it.to].filter(Boolean).join(" → ");
      meta.push([modeName(it.mode), route].filter(Boolean).join(": "));
    } else if (it.city) meta.push(it.city);
    if (opts.showDate) {
      if (isDate(it.date)) {
        var dd = fmtDay(it.date) + (isDate(it.endDate) && it.endDate !== it.date ? " – " + fmtDay(it.endDate) : "");
        var tt = it.time ? fmtTime(it.time) + (it.endTime ? " – " + fmtTime(it.endTime) : "") : "";
        meta.push(dd + (tt ? ", " + tt : ""));
      } else meta.push(t("nodate"));
    }
    var metaHTML = meta.filter(Boolean).map(esc).join(" · ");
    var url = safeUrl(it.link);
    if (url) metaHTML += (metaHTML ? " · " : "") + '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(t("f.link")) + "</a>";
    var st = STATUSES.indexOf(it.status) >= 0 ? it.status : "planned";
    var sel = '<select class="st ' + st + '" data-status="' + esc(it.id) + '" aria-label="' + esc(t("f.status") + ": " + (it.name || "")) + '">' +
      STATUSES.map(function (s) { return '<option value="' + s + '"' + (s === st ? " selected" : "") + ">" + esc(stName(s)) + "</option>"; }).join("") + "</select>";
    return '<article class="row c-' + catKey + (st === "cancelled" ? " cancelled" : "") + '" data-edit="' + esc(it.id) + '">' +
      '<div class="ic" aria-hidden="true">' + icon + "</div>" +
      '<div class="body"><button type="button" class="name">' + esc(it.name || "—") + "</button>" +
      (metaHTML ? '<div class="meta">' + metaHTML + "</div>" : "") +
      (it.notes ? '<div class="inote">' + esc(it.notes) + "</div>" : "") +
      (opts.showBy ? '<div class="by meta">' + avatar(it.by, memberName(it.by)) + "<span>" + esc(memberName(it.by)) + "</span></div>" : "") +
      "</div>" +
      '<div class="side">' + (typeof it.price === "number" ? '<span class="price">' + esc(money(it.price)) + "</span>" : "") + sel + "</div></article>";
  }
  function listHTML(rows, emptyHTML) { return '<div class="list">' + (rows.length ? rows.join("") : '<div class="empty">' + emptyHTML + "</div>") + "</div>"; }

  /* ---------- day timeline (Google Calendar style) ---------- */
  function layoutBlocks(evts) {
    evts.sort(function (a, b) { return a.s - b.s || b.e - a.e; });
    var out = [], cluster = [], clusterEnd = -1;
    function flush() {
      var cols = [];
      cluster.forEach(function (ev) { var c = 0; while (cols[c] !== undefined && cols[c] > ev.s) c++; cols[c] = ev.e; ev.col = c; });
      cluster.forEach(function (ev) { ev.n = cols.length; });
      out = out.concat(cluster); cluster = [];
    }
    evts.forEach(function (ev) {
      if (cluster.length && ev.s >= clusterEnd) { flush(); clusterEnd = -1; }
      cluster.push(ev); clusterEnd = Math.max(clusterEnd, ev.e);
    });
    if (cluster.length) flush();
    return out;
  }
  function chipHTML(it, d) {
    var catKey = CATS.indexOf(it.category) >= 0 ? it.category : "other";
    var sub = "";
    if (catKey === "hotel") sub = it.date === d ? t("stay.in") : (it.endDate === d ? t("stay.out") : t("stay.tonight"));
    return '<button type="button" class="chip c-' + catKey + " st-" + esc(it.status || "planned") + '" data-edit="' + esc(it.id) + '">' + CAT_ICON[catKey] + " " + esc(it.name || "—") + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</button>";
  }
  function timelineHTML(d, timed, today) {
    var ev = timed.map(function (it) {
      var s = mins(it.time), e = mins(it.endTime);
      if (e == null || e <= s) e = s + 60;
      e = Math.min(e, 1440);
      if (e <= s) s = e - 30;
      return { s: s, e: e, it: it };
    });
    var h0 = prefs.dayStart, h1 = prefs.dayEnd;
    ev.forEach(function (x) { h0 = Math.min(h0, Math.floor(x.s / 60)); h1 = Math.max(h1, Math.ceil(x.e / 60)); });
    var html = '<div class="tl-card"><div class="tl-grid" data-h0="' + h0 + '" data-h1="' + h1 + '" style="height:' + (h1 - h0) * HOUR_H + 'px">';
    for (var h = h0; h < h1; h++) html += '<div class="tl-h" style="top:' + (h - h0) * HOUR_H + 'px"><span>' + esc(fmtHour(h)) + "</span></div>";
    layoutBlocks(ev).forEach(function (x) {
      var it = x.it, catKey = CATS.indexOf(it.category) >= 0 ? it.category : "other";
      var top = (x.s - h0 * 60) / 60 * HOUR_H, hgt = Math.max((x.e - x.s) / 60 * HOUR_H - 2, 22);
      var range = fmtTime(minToTime(x.s)) + (it.endTime ? " – " + fmtTime(minToTime(x.e)) : "");
      html += '<button type="button" class="tl-b c-' + catKey + " st-" + esc(it.status || "planned") + (hgt < 40 ? " short" : "") + '" data-edit="' + esc(it.id) + '" style="top:' + top + "px;height:" + hgt +
        "px;left:calc(" + x.col + " / " + x.n + " * 100% + 2px);width:calc(100% / " + x.n + ' - 4px)"><b>' + esc(it.name || "—") + "</b><span>" + esc(range) + "</span></button>";
    });
    if (d === today) html += '<div class="tl-now" id="tl-now" hidden></div>';
    return html + "</div></div>";
  }
  function positionNow() {
    var line = $("tl-now"), grid = line && line.parentNode; if (!grid) return;
    var n = new Date(), m = n.getHours() * 60 + n.getMinutes(), h0 = +grid.dataset.h0, h1 = +grid.dataset.h1;
    if (m < h0 * 60 || m > h1 * 60) { line.hidden = true; return; }
    line.hidden = false; line.style.top = (m - h0 * 60) / 60 * HOUR_H + "px";
  }

  /* ---------- views ---------- */
  function currentView() { var h = location.hash.replace("#", ""); return ["plan", "items", "costs", "trip"].indexOf(h) >= 0 ? h : "plan"; }

  function renderPlan() {
    var days = allDays(), today = todayISO(), vis = visibleItems();
    var undated = vis.filter(function (it) { return !isDate(it.date); });
    if (selDay !== "none" && days.indexOf(selDay) < 0) selDay = null;
    if (selDay === "none" && !undated.length && days.length) selDay = null;
    if (selDay === null) selDay = days.indexOf(today) >= 0 ? today : (days[0] || "none");

    $("days").innerHTML = days.map(function (d) {
      return '<button type="button" class="day' + (d === today ? " today" : "") + '" data-day="' + d + '" aria-pressed="' + (d === selDay) + '"><b>' + esc(dayLabel(d, days)) + "</b><span>" + esc(fmtDay(d)) + (d === today ? " · " + esc(t("today")) : "") + "</span></button>";
    }).join("") + (undated.length || !days.length ? '<button type="button" class="day" data-day="none" aria-pressed="' + (selDay === "none") + '"><b>' + esc(t("nodate")) + "</b><span>" + esc(undated.length === 1 ? t("items.1") : t("items.n", { n: undated.length })) + "</span></button>" : "");

    var body = $("plan-body");
    if (!ready.items || !ready.trip) { body.innerHTML = listHTML([], esc(unreachable ? t("b.unreachable") : t("loading"))); return; }
    if (!items.length && !days.length) {
      body.innerHTML = '<div class="list"><div class="empty"><strong>' + esc(t("empty.title")) + "</strong><br>" + esc(t("empty.body")) +
        '<br><a class="btn" href="#trip">' + esc(t("empty.set")) + '</a> <button class="btn primary" type="button" data-add="">' + esc(t("empty.add")) + "</button></div></div>";
      return;
    }
    if (selDay === "none") {
      body.innerHTML = '<div class="sec"><div class="head"><h2>' + esc(t("nodate")) + '</h2><span class="num note">' + esc(money(sum(undated))) + "</span></div>" +
        listHTML(undated.map(function (it) { return rowHTML(it); }), esc(t("plan.alldated"))) + "</div>";
      return;
    }
    var d = selDay;
    var list = vis.filter(function (it) { return onDay(it, d); });
    var hotels = list.filter(function (it) { return it.category === "hotel"; });
    var others = list.filter(function (it) { return it.category !== "hotel"; });
    var allday = hotels.concat(others.filter(function (it) { return mins(it.time) == null; }));
    var timed = others.filter(function (it) { return mins(it.time) != null; });
    var dayCost = sum(items.filter(function (it) { return it.date === d; }));
    var html = '<div class="head"><h2>' + esc(dayLabel(d, days) + " · " + fmtDay(d, true)) + '</h2><span class="num note">' + (dayCost ? esc(t("day.cost", { x: money(dayCost) })) : "") + "</span></div>";
    if (allday.length) html += '<div class="allday"><span class="label">' + esc(t("allday")) + "</span>" + allday.map(function (it) { return chipHTML(it, d); }).join("") + "</div>";
    html += timelineHTML(d, timed, today) + '<p class="note">' + esc(t("plan.hint")) + "</p>";
    var key = "day:" + d, noteVal = drafts[key] != null ? drafts[key] : (dayNotes[d] || "");
    html += '<div class="sec"><label class="label" for="dn-' + d + '">' + esc(t("notes.day")) + '</label><textarea id="dn-' + d + '" data-daynote="' + d + '" rows="3" placeholder="' + esc(t("notes.day.ph")) + '">' + esc(noteVal) + "</textarea></div>";
    body.innerHTML = html;
    positionNow();
  }

  function fillSelect(el, opts) {
    var sig = JSON.stringify(opts);
    if (el.dataset.sig === sig) return;
    var keep = el.value;
    el.innerHTML = opts.map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + "</option>"; }).join("");
    el.dataset.sig = sig;
    if (opts.some(function (o) { return o[0] === keep; })) el.value = keep;
  }
  function renderItems() {
    var days = allDays();
    fillSelect($("f-cat-filter"), [["", t("all.cat")]].concat(CATS.map(function (c) { return [c, catName(c)]; })));
    fillSelect($("f-status-filter"), [["", t("any.status")], ["active", t("active")]].concat(STATUSES.map(function (s) { return [s, stName(s)]; })));
    fillSelect($("f-day-filter"), [["", t("all.days")]].concat(days.map(function (d) { return [d, dayLabel(d, days) + " · " + fmtDay(d)]; })).concat([["none", t("nodate")]]));
    var people = Object.keys(members).sort(function (a, b) { return memberName(a).localeCompare(memberName(b)); }).map(function (u) { return [u, memberName(u)]; });
    fillSelect($("f-by-filter"), [["", t("everyone")]].concat(people));
    var fc = $("f-cat-filter").value, fs2 = $("f-status-filter").value, fd = $("f-day-filter").value, fb = $("f-by-filter").value, so = $("f-sort").value;
    var list = items.filter(function (it) {
      if (!prefs.showCancelled && it.status === "cancelled" && fs2 !== "cancelled") return false;
      if (fc && (CATS.indexOf(it.category) >= 0 ? it.category : "other") !== fc) return false;
      if (fs2 === "active" ? it.status === "cancelled" : (fs2 && (it.status || "planned") !== fs2)) return false;
      if (fd === "none" ? isDate(it.date) : (fd && !onDay(it, fd))) return false;
      if (fb && it.by !== fb) return false;
      return true;
    });
    var hi = so === "price-desc" ? -Infinity : Infinity;
    list.sort(function (a, b) {
      if (so === "name") return String(a.name).localeCompare(String(b.name));
      if (so === "price-asc" || so === "price-desc") {
        var pa = typeof a.price === "number" ? a.price : hi, pb = typeof b.price === "number" ? b.price : hi;
        if (pa !== pb) return so === "price-asc" ? pa - pb : pb - pa;
        return String(a.name).localeCompare(String(b.name));
      }
      var ka = (isDate(a.date) ? a.date : "9999") + (a.time || "99:99"), kb = (isDate(b.date) ? b.date : "9999") + (b.time || "99:99");
      return ka < kb ? -1 : ka > kb ? 1 : String(a.name).localeCompare(String(b.name));
    });
    $("items-count").textContent = !ready.items ? "" : t("items.count", { n: list.length, m: items.length });
    $("items-total").textContent = list.length ? t("items.total", { x: money(sum(list)) }) : "";
    $("items-body").innerHTML = listHTML(list.map(function (it) { return rowHTML(it, { showDate: true, showBy: true }); }),
      esc(!ready.items ? (unreachable ? t("b.unreachable") : t("loading")) : (items.length ? t("items.nomatch") : t("items.none"))));
  }

  function renderCosts() {
    var live = items.filter(counts), total = sum(live), days = allDays();
    var committed = sum(live.filter(function (it) { return it.status === "booked" || it.status === "done"; }));
    var html = '<div class="sec"><p class="label">' + esc(t("costs.total")) + '</p><div class="total">' + esc(money(total) || "0") + '</div><p class="note">' +
      esc(t("costs.split", { a: money(committed) || "0", b: money(total - committed) || "0" })) + "</p></div>";
    if (!live.length) { $("costs-body").innerHTML = html + listHTML([], esc(ready.items ? t("costs.none") : t("loading"))); return; }
    var byCat = CATS.map(function (c) { return [catName(c), sum(live.filter(function (it) { return (CATS.indexOf(it.category) >= 0 ? it.category : "other") === c; }))]; })
      .filter(function (r) { return r[1] > 0; }).sort(function (a, b) { return b[1] - a[1]; });
    var max = byCat.length ? byCat[0][1] : 1;
    html += '<div class="sec"><p class="label">' + esc(t("costs.cat")) + '</p><div class="bars">' + byCat.map(function (r) {
      return '<div class="barrow"><div class="head"><span>' + esc(r[0]) + '</span><span class="num">' + esc(money(r[1])) + '</span></div><div class="meter"><i style="width:' + Math.max(2, Math.round(r[1] / max * 100)) + '%"></i></div></div>';
    }).join("") + "</div></div>";
    var byDay = days.map(function (d) { return [dayLabel(d, days) + " · " + fmtDay(d), sum(live.filter(function (it) { return it.date === d; }))]; }).filter(function (r) { return r[1] > 0; });
    var und = sum(live.filter(function (it) { return !isDate(it.date); }));
    if (und) byDay.push([t("nodate"), und]);
    html += '<div class="sec"><p class="label">' + esc(t("costs.day")) + '</p><div class="list">' + byDay.map(function (r) {
      return '<div class="kv"><span>' + esc(r[0]) + '</span><span class="num">' + esc(money(r[1])) + "</span></div>";
    }).join("") + '</div><p class="note">' + esc(t("costs.note")) + "</p></div>";
    $("costs-body").innerHTML = html;
  }

  function renderTrip() {
    var ta = $("trip-notes");
    if (document.activeElement !== ta) ta.value = drafts.trip != null ? drafts.trip : (trip.notes || "");
    var f = $("trip-form");
    if (!f.contains(document.activeElement) && !f.dataset.dirty) {
      $("t-name").value = trip.name || ""; $("t-start").value = isDate(trip.start) ? trip.start : "";
      $("t-end").value = isDate(trip.end) ? trip.end : ""; $("t-cur").value = trip.currency || "";
    }
    $("people").innerHTML = Object.keys(members).sort(function (a, b) { return memberName(a).localeCompare(memberName(b)); }).map(function (u) {
      return '<div class="person">' + avatar(u, memberName(u), "lg") + "<span>" + esc(memberName(u)) + (user && u === user.uid ? " (" + esc(t("trip.you")) + ")" : "") + "</span></div>";
    }).join("");
  }

  function render() {
    if ($("app").hidden) return;
    var v = currentView();
    ["plan", "items", "costs", "trip"].forEach(function (n) { $("v-" + n).hidden = n !== v; });
    Array.prototype.forEach.call(document.querySelectorAll(".tabs a"), function (a) {
      if (a.getAttribute("href") === "#" + v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    var sub = !ready.trip ? t("loading") : (trip.name || t("trip.untitled"));
    if (ready.trip && isDate(trip.start) && isDate(trip.end)) sub += " · " + fmtDay(trip.start) + " – " + fmtDay(trip.end);
    $("sub").textContent = sub;
    var liveAll = items.filter(function (it) { return it.status !== "cancelled"; });
    var sorted = liveAll.filter(function (it) { return it.status === "booked" || it.status === "done"; }).length;
    $("hero-total").textContent = money(sum(items)) || "0";
    $("prog-fill").style.width = (liveAll.length ? Math.round(sorted / liveAll.length * 100) : 0) + "%";
    $("prog-cap").textContent = liveAll.length ? t("hero.progress", { n: sorted, m: liveAll.length }) : t("hero.empty");
    var b = $("banner");
    if (dead) { b.hidden = false; b.textContent = t("b.dead"); }
    else if (unreachable) { b.hidden = false; b.textContent = t("b.unreachable"); }
    else b.hidden = true;

    var ae = document.activeElement, keep = null;
    if (ae && ae.id && ae.tagName === "TEXTAREA" && $("plan-body").contains(ae)) keep = { id: ae.id, v: ae.value, s: ae.selectionStart, e: ae.selectionEnd };
    if (v === "plan") renderPlan(); else if (v === "items") renderItems(); else if (v === "costs") renderCosts(); else renderTrip();
    if (keep) { var el = $(keep.id); if (el) { el.value = keep.v; el.focus(); try { el.setSelectionRange(keep.s, keep.e); } catch (e) {} } }
  }

  /* ---------- notes: one write per pause, one at a time per doc ---------- */
  function saveLater(key, fn) {
    clearTimeout(timers[key]);
    timers[key] = setTimeout(function () {
      var sent = drafts[key];
      chains[key] = (chains[key] || Promise.resolve()).then(function () { return fn(sent); }).then(function () {
        if (drafts[key] === sent) delete drafts[key];
        if (key === "trip") $("trip-notes-msg").textContent = t("saved");
      }).catch(writeFailed);
    }, 800);
  }
  function saveTrip(patch) { return tdoc("trip/main").set(Object.assign({}, trip, patch, { updatedAt: Date.now() })); }

  /* ---------- add / edit dialog ---------- */
  var editingId = null, editingItem = null, pending = null, existingImg = null, imgRemoved = false;
  var touched = {}, lastLink = "", busy = false, xhr = { ctl: null, seq: 0 };
  var FORM_IDS = ["i-name", "i-city", "i-mode", "i-from", "i-to", "i-date", "i-end", "i-time", "i-endtime", "i-price", "i-notes"];

  function buildFormOptions() {
    var cur = (document.querySelector('input[name="i-cat"]:checked') || {}).value;
    $("i-cats").innerHTML = CATS.map(function (c) { return '<label><input type="radio" name="i-cat" value="' + c + '"><span>' + esc(CAT_ICON[c] + " " + catName(c)) + "</span></label>"; }).join("");
    setCat(cur || "activity");
    var mode = $("i-mode").value, st = $("i-status").value;
    $("i-mode").innerHTML = MODES.map(function (m) { return '<option value="' + m + '">' + esc(modeName(m)) + "</option>"; }).join("");
    $("i-status").innerHTML = STATUSES.map(function (s) { return '<option value="' + s + '">' + esc(stName(s)) + "</option>"; }).join("");
    if (mode) $("i-mode").value = mode; if (st) $("i-status").value = st;
  }
  function catValue() { var r = document.querySelector('input[name="i-cat"]:checked'); return r ? r.value : "other"; }
  function syncCatFields() {
    var c = catValue();
    $("w-transport").hidden = c !== "transport";
    $("w-city").hidden = c === "transport";
    $("w-end").hidden = c !== "hotel";
    $("w-time").hidden = c === "hotel";
    $("l-date").textContent = t(c === "hotel" ? "f.checkin" : "f.date");
    $("l-price").textContent = t(c === "hotel" ? "f.price.stay" : "f.price") + (trip.currency ? " (" + String(trip.currency).toUpperCase() + ")" : "");
  }
  function setCat(c) {
    var r = document.querySelector('input[name="i-cat"][value="' + (CATS.indexOf(c) >= 0 ? c : "other") + '"]');
    if (r) r.checked = true;
    syncCatFields();
  }

  function setMsg(text, kind, spin) {
    var el = $("s-msg"); el.className = "msg" + (kind ? " " + kind : "");
    el.textContent = ""; if (spin) { var s = document.createElement("span"); s.className = "spin"; el.appendChild(s); }
    el.appendChild(document.createTextNode(text || ""));
  }
  function updateSmartUI() { $("s-go").hidden = busy || !(safeUrl($("i-link").value) || pending); }
  function setThumb() {
    var src = pending ? pending.store : (!imgRemoved && existingImg ? existingImg : "");
    $("s-thumb").hidden = !src; if (src) $("s-img").src = src; else $("s-img").removeAttribute("src");
    $("s-thumb").classList.remove("zoom");
  }

  function openItem(id, presetDate, presetTime) {
    var it = id ? items.filter(function (x) { return x.id === id; })[0] : null;
    if (id && !it) return;
    cancelExtract();
    editingId = it ? it.id : null; editingItem = it;
    $("dlg-title").textContent = t(it ? "dlg.edit" : "dlg.add");
    var d = it;
    if (!d) {
      var st = mins(presetTime), end = st != null && st + 60 <= 1439 ? minToTime(st + 60) : "";
      d = { category: "activity", status: "planned", date: isDate(presetDate) ? presetDate : "", time: st != null ? presetTime : "", endTime: end };
    }
    setCat(d.category);
    $("i-name").value = d.name || ""; $("i-city").value = d.city || "";
    $("i-mode").value = MODES.indexOf(d.mode) >= 0 ? d.mode : "Flight"; $("i-from").value = d.from || ""; $("i-to").value = d.to || "";
    $("i-date").value = isDate(d.date) ? d.date : ""; $("i-end").value = isDate(d.endDate) ? d.endDate : "";
    $("i-time").value = d.time || ""; $("i-endtime").value = d.endTime || "";
    $("i-price").value = typeof d.price === "number" ? d.price : "";
    $("i-status").value = STATUSES.indexOf(d.status) >= 0 ? d.status : "planned";
    $("i-link").value = d.link || ""; $("i-notes").value = d.notes || "";
    $("i-msg").textContent = ""; setMsg("");
    touched = {}; pending = null; existingImg = null; imgRemoved = false; lastLink = safeUrl(d.link) || ""; busy = false;
    setThumb(); updateSmartUI();
    if (it && it.hasImage) {
      col("files").doc(it.id).get().then(function (s) { if (editingId === it.id && s.exists) { existingImg = s.data().data; setThumb(); } }).catch(function () {});
    }
    var by = $("i-by"); by.hidden = !it; if (it) by.textContent = t("addedby", { name: memberName(it.by) });
    var del = $("i-del"); del.hidden = !editingId; del.textContent = t("delete"); del.dataset.armed = ""; del.disabled = false;
    $("i-save").disabled = false;
    var dlg = $("dlg");
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    if (!editingId) $("i-link").focus();
  }
  function closeDlg() { cancelExtract(); var dlg = $("dlg"); if (dlg.close) dlg.close(); else dlg.removeAttribute("open"); }
  function cancelExtract() { xhr.seq++; if (xhr.ctl) xhr.ctl.abort(); xhr.ctl = null; busy = false; }

  function readForm() {
    var c = catValue(), p = parseFloat($("i-price").value);
    var o = { name: $("i-name").value.trim(), category: c, status: $("i-status").value, date: $("i-date").value || "", price: isFinite(p) && p >= 0 ? p : null,
      link: $("i-link").value.trim(), notes: $("i-notes").value.trim(), updatedAt: Date.now() };
    if (c === "transport") { o.mode = $("i-mode").value; o.from = $("i-from").value.trim(); o.to = $("i-to").value.trim(); } else o.city = $("i-city").value.trim();
    if (c === "hotel") o.endDate = $("i-end").value || ""; else { o.time = $("i-time").value || ""; o.endTime = o.time ? ($("i-endtime").value || "") : ""; }
    return o;
  }

  /* smart fill: link or screenshot -> /api/extract -> prefilled form */
  function loadImg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("image")); };
      img.src = url;
    });
  }
  function toJpeg(img, maxDim, q) {
    var w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, maxDim / Math.max(w, h));
    var c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", q);
  }
  function fitUnder(img, limit, dims, qs) {
    var out = "";
    for (var i = 0; i < dims.length; i++) { out = toJpeg(img, dims[i], qs[i]); if (out.length <= limit) return out; }
    return out;
  }
  function attachImage(file) {
    if (!file || !/^image\//.test(file.type)) return;
    loadImg(file).then(function (img) {
      pending = { ai: fitUnder(img, 2800000, [1600, 1400, 1100], [0.82, 0.65, 0.5]), store: fitUnder(img, 600000, [1000, 800, 640], [0.6, 0.5, 0.4]) };
      imgRemoved = false; setThumb(); updateSmartUI(); setMsg("");
      if (prefs.autoRead) runExtract();
    }).catch(function () { setMsg(t("smart.badimg"), "err"); });
  }

  function applyFields(f) {
    var n = 0;
    function put(id, v) {
      if (v == null || v === "") return;
      n++; if (touched[id]) return;
      $(id).value = v;
    }
    if (typeof f.category === "string" && CATS.indexOf(f.category) >= 0) { n++; if (!touched.cat) setCat(f.category); }
    var cat = catValue();
    put("i-name", f.name);
    if (cat === "transport") { if (MODES.indexOf(f.mode) >= 0) put("i-mode", f.mode); put("i-from", f.from); put("i-to", f.to); } else put("i-city", f.city);
    put("i-date", f.date);
    if (cat === "hotel") put("i-end", f.endDate); else { put("i-time", f.time); if (f.time) put("i-endtime", f.endTime); }
    put("i-price", f.price);
    var notes = typeof f.notes === "string" ? f.notes.trim() : "";
    var cur = typeof f.currency === "string" ? f.currency.toUpperCase() : "";
    if (cur && trip.currency && cur !== String(trip.currency).toUpperCase() && typeof f.price === "number") notes = (notes ? notes + "\n" : "") + t("smart.curnote", { cur: cur });
    if (notes && !touched["i-notes"] && !$("i-notes").value.trim()) { $("i-notes").value = notes; n++; }
    return n;
  }
  function runExtract() {
    var link = safeUrl($("i-link").value);
    if (!link && !pending) return;
    if (xhr.ctl) xhr.ctl.abort();
    var ctl = new AbortController(), seq = ++xhr.seq, timedOut = false;
    xhr.ctl = ctl; busy = true; updateSmartUI(); setMsg(t("smart.reading"), "", true);
    var to = setTimeout(function () { timedOut = true; ctl.abort(); }, 55000);
    user.getIdToken().then(function (tok) {
      return fetch("/api/extract", {
        method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
        body: JSON.stringify({ url: link || undefined, image: pending ? pending.ai : undefined, lang: prefs.lang, today: todayISO(), tripStart: trip.start || null, tripEnd: trip.end || null, currency: trip.currency || null })
      });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) { if (!res.ok) { var e = new Error("http"); e.status = res.status; throw e; } return j; });
    }).then(function (j) {
      if (seq !== xhr.seq) return;
      var n = applyFields(j && j.fields ? j.fields : {});
      setMsg(n ? (n === 1 ? t("smart.filled1") : t("smart.filled", { n: n })) : t("smart.none"), n ? "ok" : "");
    }).catch(function (e) {
      if (seq !== xhr.seq) return;
      if (e && e.name === "AbortError" && !timedOut) return;
      var s = e && e.status, k = "smart.fail";
      if (s === 401 || s === 403) k = "smart.denied"; else if (s === 501) k = "smart.notset"; else if (s === 404 || s === 405) k = "smart.unavailable"; else if (s === 413) k = "smart.toobig"; else if (s === 429) k = "smart.rate";
      setMsg(t(k), "err");
    }).then(function () { clearTimeout(to); if (seq === xhr.seq) { xhr.ctl = null; busy = false; updateSmartUI(); } });
  }
  function maybeAutoLink() {
    var l = safeUrl($("i-link").value); updateSmartUI();
    if (!l || l === lastLink) return;
    lastLink = l; if (prefs.autoRead) runExtract();
  }

  /* ---------- settings ---------- */
  function hourOptions(from, to) { var o = []; for (var h = from; h <= to; h++) o.push('<option value="' + h + '">' + esc(h === 24 ? (prefs.time === "24" ? "24:00" : "12 AM") : fmtHour(h)) + "</option>"); return o.join(""); }
  function renderSettings() {
    Array.prototype.forEach.call(document.querySelectorAll(".seg button[data-pref]"), function (b) { b.setAttribute("aria-pressed", String(String(prefs[b.dataset.pref]) === b.dataset.val)); });
    $("set-start").innerHTML = hourOptions(0, 12); $("set-end").innerHTML = hourOptions(12, 24);
    $("set-start").value = String(prefs.dayStart); $("set-end").value = String(prefs.dayEnd);
    $("set-cancelled").checked = !!prefs.showCancelled; $("set-auto").checked = !!prefs.autoRead;
    var name = profile.username || "";
    $("set-av").outerHTML = avatar(user && user.uid, name, "lg").replace('class="av lg"', 'id="set-av" class="av lg"');
    $("set-uname").textContent = name; $("set-email").textContent = user && user.email ? user.email : "";
    if (document.activeElement !== $("set-name")) $("set-name").value = name;
  }
  var prefTimer = null;
  function savePrefs() {
    try { localStorage.setItem("binafast-prefs", JSON.stringify(prefs)); } catch (e) {}
    if (!fs || !user) return;
    clearTimeout(prefTimer);
    prefTimer = setTimeout(function () { fs.collection("users").doc(user.uid).set({ prefs: prefs, updatedAt: Date.now() }, { merge: true }).catch(function () {}); }, 600);
  }
  function setPref(k, v) {
    prefs[k] = v; savePrefs();
    if (k === "theme") applyTheme();
    if (k === "lang") applyStatic();
    renderSettings(); render();
  }
  function openSettings() { renderSettings(); var d = $("set-dlg"); $("set-name-msg").textContent = ""; if (d.showModal) d.showModal(); else d.setAttribute("open", ""); }
  function closeSettings() { var d = $("set-dlg"); if (d.close) d.close(); else d.removeAttribute("open"); }

  function nameConflict(name, exceptUid) {
    return Object.keys(members).some(function (u) { return u !== exceptUid && String(members[u].name || "").toLowerCase() === name.toLowerCase(); });
  }
  function changeName() {
    var v = $("set-name").value.trim().replace(/\s+/g, " "), msg = $("set-name-msg");
    msg.className = "msg err";
    if (v === profile.username) { msg.textContent = ""; return; }
    if (!NAME_RE.test(v)) { msg.textContent = t("username.invalid"); return; }
    if (nameConflict(v, user.uid)) { msg.textContent = t("username.taken"); return; }
    $("set-name-save").disabled = true;
    fs.collection("users").doc(user.uid).set({ username: v, updatedAt: Date.now() }, { merge: true })
      .then(function () { profile.username = v; return col("members").doc(user.uid).set({ name: v, updatedAt: Date.now() }, { merge: true }); })
      .then(function () { msg.className = "msg ok"; msg.textContent = t("set.updated"); renderSettings(); })
      .catch(function (e) { msg.textContent = t("e.nosave"); writeFailed(e); })
      .then(function () { $("set-name-save").disabled = false; });
  }

  function csvCell(v) {
    if (v == null) return "";
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(v)) v = "'" + v;
    v = String(v);
    return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function exportCsv() {
    var rows = [[t("f.name"), t("f.cat"), t("f.status"), t("f.date"), t("f.checkout"), t("f.start"), t("f.end"), t("f.city"), t("f.mode"), t("f.from"), t("f.to"), t("f.price"), t("trip.cur"), t("f.link"), t("f.notes"), t("f.by")]];
    items.slice().sort(function (a, b) { return String(a.date || "9999") + (a.time || "") < String(b.date || "9999") + (b.time || "") ? -1 : 1; }).forEach(function (it) {
      rows.push([it.name, catName(it.category), stName(it.status), it.date || "", it.endDate || "", it.time || "", it.endTime || "", it.city || "", it.mode ? modeName(it.mode) : "", it.from || "", it.to || "",
        typeof it.price === "number" ? it.price : "", trip.currency || "", it.link || "", it.notes || "", memberName(it.by)]);
    });
    var blob = new Blob(["﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "binafast-" + String(trip.name || "trip").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".csv";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }
  function copyText(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
  }
  function shareUrl() { return location.origin + location.pathname + "?t=" + code; }

  /* ---------- events ---------- */
  var main = document.querySelector("main");
  main.addEventListener("click", function (e) {
    var tg = e.target;
    if (tg.closest("a, select, textarea")) return;
    var add = tg.closest("[data-add]"); if (add) { openItem(null, add.dataset.add); return; }
    var day = tg.closest("[data-day]"); if (day) { selDay = day.dataset.day; render(); return; }
    var row = tg.closest("[data-edit]"); if (row) { openItem(row.dataset.edit); return; }
    var grid = tg.closest(".tl-grid");
    if (grid && isDate(selDay)) {
      var y = e.clientY - grid.getBoundingClientRect().top, m = Math.floor((+grid.dataset.h0 * 60 + y / HOUR_H * 60) / 30) * 30;
      openItem(null, selDay, minToTime(Math.max(0, Math.min(m, 1410))));
    }
  });
  main.addEventListener("change", function (e) {
    var tg = e.target;
    if (tg.dataset && tg.dataset.status) col("items").doc(tg.dataset.status).update({ status: tg.value, updatedAt: Date.now() }).catch(writeFailed);
    else if (tg.closest && tg.closest(".filters")) renderItems();
  });
  main.addEventListener("input", function (e) {
    var tg = e.target;
    if (tg.dataset && tg.dataset.daynote) {
      var d = tg.dataset.daynote, key = "day:" + d;
      drafts[key] = tg.value;
      saveLater(key, function (text) { return tdoc("daynotes/" + d).set({ text: text, updatedAt: Date.now() }); });
    } else if (tg.id === "trip-notes") {
      drafts.trip = tg.value; $("trip-notes-msg").textContent = "";
      saveLater("trip", function (text) { return saveTrip({ notes: text }); });
    } else if (tg.closest && tg.closest("#trip-form")) $("trip-form").dataset.dirty = "1";
  });
  $("trip-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var s = $("t-start").value, en = $("t-end").value, msg = $("t-msg");
    msg.className = "msg err";
    if (s && en && en < s) { msg.textContent = t("e.range"); return; }
    if (s && en && diffDays(s, en) > 120) { msg.textContent = t("e.long"); return; }
    var btn = $("t-save"); btn.disabled = true;
    chains.trip = (chains.trip || Promise.resolve()).then(function () {
      return saveTrip({ name: $("t-name").value.trim(), start: s, end: en, currency: $("t-cur").value.trim().toUpperCase() });
    }).then(function () { delete $("trip-form").dataset.dirty; msg.className = "msg ok"; msg.textContent = t("saved"); selDay = null; })
      .catch(function (err) { msg.textContent = t("e.nosave"); writeFailed(err); }).then(function () { btn.disabled = false; });
  });
  window.addEventListener("hashchange", render);
  setInterval(positionNow, 60000);

  $("add").addEventListener("click", function () { openItem(null, currentView() === "plan" && isDate(selDay) ? selDay : ""); });
  $("dlg-close").addEventListener("click", closeDlg);
  $("dlg").addEventListener("click", function (e) { if (e.target === $("dlg")) closeDlg(); });
  $("dlg").addEventListener("close", cancelExtract);
  $("i-cats").addEventListener("change", function () { touched.cat = true; syncCatFields(); });
  FORM_IDS.forEach(function (id) { $(id).addEventListener("input", function () { touched[id] = true; }); });
  $("i-link").addEventListener("paste", function () { setTimeout(maybeAutoLink, 0); });
  $("i-link").addEventListener("change", maybeAutoLink);
  $("i-link").addEventListener("input", updateSmartUI);
  $("s-pick").addEventListener("click", function () { $("s-file").click(); });
  $("s-file").addEventListener("change", function () { var f = this.files && this.files[0]; this.value = ""; attachImage(f); });
  $("s-rm").addEventListener("click", function () { pending = null; imgRemoved = true; setThumb(); updateSmartUI(); });
  $("s-img").addEventListener("click", function () { $("s-thumb").classList.toggle("zoom"); });
  $("s-go").addEventListener("click", runExtract);
  $("dlg").addEventListener("paste", function (e) {
    var files = e.clipboardData && e.clipboardData.files, f = Array.prototype.filter.call(files || [], function (x) { return /^image\//.test(x.type); })[0];
    if (f) { e.preventDefault(); attachImage(f); }
  });
  $("dlg").addEventListener("dragover", function (e) { e.preventDefault(); });
  $("dlg").addEventListener("drop", function (e) {
    var f = e.dataTransfer && Array.prototype.filter.call(e.dataTransfer.files || [], function (x) { return /^image\//.test(x.type); })[0];
    if (f) { e.preventDefault(); attachImage(f); }
  });

  $("item-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var o = readForm(), msg = $("i-msg");
    if (!o.name) { msg.textContent = t("e.name"); $("i-name").focus(); return; }
    if (o.endDate && o.date && o.endDate < o.date) { msg.textContent = t("e.out"); return; }
    if (o.time && o.endTime && mins(o.endTime) <= mins(o.time)) { msg.textContent = t("e.time"); return; }
    if (o.link && !safeUrl(o.link)) { msg.textContent = t("e.link"); return; }
    var old = editingItem;
    o.by = old && old.by ? old.by : user.uid;
    o.createdAt = old && old.createdAt ? old.createdAt : Date.now();
    var ref = editingId ? col("items").doc(editingId) : col("items").doc();
    var imgTask = Promise.resolve();
    if (pending) { o.hasImage = true; imgTask = col("files").doc(ref.id).set({ data: pending.store, updatedAt: Date.now() }); }
    else if (imgRemoved && old && old.hasImage) { o.hasImage = false; imgTask = col("files").doc(ref.id).delete(); }
    else if (old && old.hasImage) o.hasImage = true;
    var btn = $("i-save"); btn.disabled = true; msg.textContent = "";
    imgTask.then(function () { return ref.set(o); }).then(function () {
      if (isDate(o.date) && currentView() === "plan") selDay = o.date;
      closeDlg(); render();
    }).catch(function (err) { btn.disabled = false; msg.textContent = t("e.nosave"); writeFailed(err); });
  });
  $("i-del").addEventListener("click", function () {
    var b = this;
    if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = t("delete.confirm"); return; }
    b.disabled = true;
    var id = editingId, hadImg = editingItem && editingItem.hasImage;
    col("items").doc(id).delete().then(function () { if (hadImg) return col("files").doc(id).delete().catch(function () {}); }).then(closeDlg).catch(function (err) { b.disabled = false; writeFailed(err); });
  });

  $("open-settings").addEventListener("click", openSettings);
  $("set-close").addEventListener("click", closeSettings);
  $("set-dlg").addEventListener("click", function (e) {
    if (e.target === $("set-dlg")) { closeSettings(); return; }
    var b = e.target.closest(".seg button[data-pref]");
    if (b) { var k = b.dataset.pref, v = b.dataset.val; setPref(k, k === "theme" || k === "lang" || k === "time" ? v : v); }
  });
  $("set-start").addEventListener("change", function () { var v = +this.value; if (v < prefs.dayEnd) setPref("dayStart", v); else renderSettings(); });
  $("set-end").addEventListener("change", function () { var v = +this.value; if (v > prefs.dayStart) setPref("dayEnd", v); else renderSettings(); });
  $("set-cancelled").addEventListener("change", function () { setPref("showCancelled", this.checked); });
  $("set-auto").addEventListener("change", function () { setPref("autoRead", this.checked); });
  $("set-name-save").addEventListener("click", changeName);
  $("set-export").addEventListener("click", exportCsv);
  $("set-copy").addEventListener("click", function () { var b = this; copyText(shareUrl(), function () { b.textContent = t("copied"); setTimeout(function () { b.textContent = t("set.copylink"); }, 1500); }); });
  $("share-copy").addEventListener("click", function () { var b = this; copyText($("share-link").value, function () { b.textContent = t("copied"); setTimeout(function () { b.textContent = t("copy"); }, 1500); }); });
  $("set-switch").addEventListener("click", function () { closeSettings(); leaveTrip(); });
  document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-signout]")) { closeSettings(); if (auth) auth.signOut(); } });

  /* ---------- sign-in, username, join ---------- */
  function showGate(name) {
    $("gate").hidden = !name; $("app").hidden = !!name;
    ["setup", "loading", "signin", "error", "username", "trip"].forEach(function (n) { $("g-" + n).hidden = n !== name; });
  }
  function getCode() {
    var c = new URLSearchParams(location.search).get("t");
    if (c && CODE_RE.test(c)) return c;
    try { c = localStorage.getItem("binafast-trip"); } catch (e) { c = null; }
    return c && CODE_RE.test(c) ? c : null;
  }
  function newCode() {
    var abc = "abcdefghijkmnpqrstuvwxyz23456789", a = new Uint8Array(20), out = "";
    crypto.getRandomValues(a);
    for (var i = 0; i < a.length; i++) out += abc[a[i] % abc.length];
    return out;
  }
  function suggestName() {
    var n = (user && user.displayName || "").trim().split(/\s+/)[0] || "";
    return n.replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 20);
  }
  function showUsername(err) {
    var inp = $("u-name"); if (!inp.value) inp.value = profile.username || suggestName();
    $("u-msg").textContent = err || ""; $("u-go").disabled = false; showGate("username"); inp.focus();
  }
  function teardown() {
    unsubs.forEach(function (f) { try { f(); } catch (e) {} }); unsubs = [];
    cancelExtract(); closeDlg(); closeSettings();
    items = []; trip = {}; dayNotes = {}; members = {}; ready = { items: false, trip: false }; unreachable = false; dead = false; selDay = null; drafts = {};
  }
  function leaveTrip() {
    teardown(); code = null;
    try { localStorage.removeItem("binafast-trip"); } catch (e) {}
    history.replaceState(null, "", location.pathname);
    $("g-hi").textContent = t("g.hi", { name: profile.username || "" }); $("g-code").value = ""; $("g-msg").textContent = "";
    showGate("trip");
  }
  function onAuth(u) {
    if (!u) { teardown(); user = null; profile = {}; showGate("signin"); return; }
    user = u; showGate("loading");
    loadProfile();
  }
  function loadProfile() {
    fs.collection("users").doc(user.uid).get().then(function (s) {
      profile = s.exists ? s.data() : {};
      if (profile.prefs) { prefs = Object.assign({}, prefs, cleanPrefs(profile.prefs)); try { localStorage.setItem("binafast-prefs", JSON.stringify(prefs)); } catch (e) {} applyTheme(); applyStatic(); }
      route();
    }).catch(function () { showGate("error"); });
  }
  function route() {
    if (!profile.username) { showUsername(""); return; }
    code = getCode();
    if (!code) { $("g-hi").textContent = t("g.hi", { name: profile.username }); showGate("trip"); return; }
    join();
  }
  function join() {
    showGate("loading");
    col("members").get().then(function (snap) {
      var taken = false, mine = false;
      snap.docs.forEach(function (d) {
        if (d.id === user.uid) mine = true;
        else if (String(d.data().name || "").toLowerCase() === profile.username.toLowerCase()) taken = true;
      });
      if (taken) { showUsername(t("username.taken")); return; }
      var data = { name: profile.username, updatedAt: Date.now() };
      if (!mine) data.joinedAt = Date.now();
      return col("members").doc(user.uid).set(data, { merge: true }).then(enter);
    }).catch(function () { showGate("error"); });
  }
  function enter() {
    try { localStorage.setItem("binafast-trip", code); } catch (e) {}
    if (new URLSearchParams(location.search).get("t") !== code) history.replaceState(null, "", location.pathname + "?t=" + code + location.hash);
    $("share-link").value = shareUrl();
    $("gate").hidden = true; $("app").hidden = false;
    var timer = setTimeout(function () { unreachable = true; render(); }, 10000), fresh = {};
    function seen(name, snap) { if (!snap.metadata.fromCache) { fresh[name] = 1; if (fresh.items && fresh.trip) { clearTimeout(timer); unreachable = false; } } }
    function fail() { clearTimeout(timer); unreachable = false; dead = true; ready.items = ready.trip = false; render(); }
    unsubs.push(function () { clearTimeout(timer); });
    unsubs.push(col("items").onSnapshot(function (snap) {
      items = snap.docs.map(function (d) { var o = Object.assign({}, d.data()); o.id = d.id; return o; });
      ready.items = true; seen("items", snap); render();
    }, fail));
    unsubs.push(tdoc("trip/main").onSnapshot(function (snap) {
      trip = snap.exists ? Object.assign({}, snap.data()) : {};
      ready.trip = true; seen("trip", snap); render();
    }, fail));
    unsubs.push(col("daynotes").onSnapshot(function (snap) {
      var m = {}; snap.docs.forEach(function (d) { var x = d.data(); m[d.id] = x && typeof x.text === "string" ? x.text : ""; });
      dayNotes = m; render();
    }, function () {}));
    unsubs.push(col("members").onSnapshot(function (snap) {
      var m = {}; snap.docs.forEach(function (d) { m[d.id] = d.data(); });
      members = m; render(); if ($("set-dlg").open) renderSettings();
    }, function () {}));
    render();
  }

  $("g-google").addEventListener("click", function () {
    var m = $("g-signin-msg"); m.textContent = "";
    auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(function (e) {
      var c = e && e.code;
      if (c === "auth/popup-closed-by-user" || c === "auth/cancelled-popup-request") return;
      m.textContent = c === "auth/popup-blocked" ? t("signin.popup") : c === "auth/unauthorized-domain" ? t("signin.domain") : c === "auth/operation-not-allowed" ? t("signin.off") : t("signin.fail");
    });
  });
  $("g-retry").addEventListener("click", function () { showGate("loading"); loadProfile(); });
  $("g-username").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = $("u-name").value.trim().replace(/\s+/g, " ");
    if (!NAME_RE.test(v)) { $("u-msg").textContent = t("username.invalid"); return; }
    $("u-go").disabled = true; $("u-msg").textContent = "";
    fs.collection("users").doc(user.uid).set({ username: v, updatedAt: Date.now() }, { merge: true })
      .then(function () { profile.username = v; route(); })
      .catch(function () { $("u-msg").textContent = t("e.nosave"); $("u-go").disabled = false; });
  });
  $("g-new").addEventListener("click", function () { code = newCode(); join(); });
  $("g-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = $("g-code").value.trim(), m = v.match(/[?&]t=([A-Za-z0-9]+)/);
    if (m) v = m[1];
    if (!CODE_RE.test(v)) { $("g-msg").textContent = t("g.bad"); return; }
    code = v; join();
  });

  /* ---------- boot ---------- */
  applyTheme(); applyStatic();
  if (!configured) { showGate("setup"); return; }
  firebase.initializeApp(cfg);
  auth = firebase.auth(); fs = firebase.firestore();
  showGate("loading");
  auth.onAuthStateChanged(onAuth);
})();
