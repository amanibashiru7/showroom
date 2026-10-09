"use strict";
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const S = { user: null, biz: {}, cats: [], lang: localStorage.lang || "en", deferredInstall: null };
const t = k => (I18N[S.lang] || {})[k] || I18N.en[k] || k;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tzs = n => "TZS " + Number(n).toLocaleString("en-US");
const dt = d => new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const toast = m => { const e = $("#toast"); e.textContent = m; e.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove("show"), 2600); };
const cookie = n => (document.cookie.match("(^|;)\\s*" + n + "=([^;]+)") || [])[2];

// ---------- Theme (light/dark, remembered, follows system until chosen) ----------
const Theme = {
  get: () => document.documentElement.dataset.theme || "light",
  set(m, save = true) {
    const h = document.documentElement; h.classList.add("tt"); h.dataset.theme = m;
    if (save) try { localStorage.theme = m; } catch {}
    $('meta[name="theme-color"]')?.setAttribute("content", m === "dark" ? "#0d1117" : "#0f2742");
    this.sync(); setTimeout(() => h.classList.remove("tt"), 350);
  },
  sync() {
    const dark = this.get() === "dark";
    $$("[data-theme-toggle]").forEach(b => {
      b.setAttribute("aria-label", dark ? "Dark mode on. Switch to light mode" : "Light mode on. Switch to dark mode");
      b.innerHTML = b.classList.contains("navi") ? `<i>${dark ? "🌙" : "☀️"}</i><span class="lbl">${dark ? "Dark mode" : "Light mode"}</span>` : (dark ? "🌙" : "☀️");
    });
  },
};
document.addEventListener("click", e => { if (e.target.closest("[data-theme-toggle]")) Theme.set(Theme.get() === "dark" ? "light" : "dark"); });
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", e => { if (!localStorage.theme) Theme.set(e.matches ? "dark" : "light", false); });
document.addEventListener("error", e => { if (e.target.tagName === "IMG") e.target.style.visibility = "hidden"; }, true); // missing images fail quietly

async function api(path, { method = "GET", body, form } = {}) {
  const opt = { method, headers: {}, credentials: "same-origin" };
  if (method !== "GET") opt.headers["X-CSRFToken"] = cookie("csrftoken");
  if (form) opt.body = form; else if (body) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
  let r;
  try { r = await fetch("/api" + path, opt); } catch { throw new Error(t("network")); }
  if (r.status === 204) return null;
  let data = await r.json().catch(() => null);
  if (!r.ok) {
    data = data || {};
    const e = new Error(data.detail || "Something went wrong."); e.status = r.status; e.errors = data.errors;
    if (e.errors) e.message = Object.values(e.errors).flat().join(" ");
    throw e;
  }
  return data;
}
const needLogin = () => { toast(t("need_login")); go("/account"); };

// ---------- Router ----------
function go(path) { history.pushState({}, "", path); route(); }
document.addEventListener("click", e => {
  const a = e.target.closest("a[data-l]");
  if (a && !e.metaKey && !e.ctrlKey) { e.preventDefault(); go(a.getAttribute("href")); }
});
window.addEventListener("popstate", route);

async function route() {
  const u = new URL(location.href), p = u.pathname;
  $("#drawer").hidden = true; clearInterval(S.slideTimer);
  document.body.classList.toggle("admin", p === "/admin" && !!S.user?.is_staff);
  const app = $("#app"); window.scrollTo(0, 0);
  renderNav(p);
  try {
    if (p === "/" || p === "/about" || p === "/contact") { await Home(app); if (p !== "/") $("#" + p.slice(1))?.scrollIntoView(); }
    else if (p === "/vehicles") await Browse(app, u.searchParams);
    else if (p.startsWith("/vehicles/")) await Detail(app, decodeURIComponent(p.split("/")[2]));
    else if (p === "/account") await Account(app);
    else if (p === "/admin") await Admin(app);
    else app.innerHTML = `<div class="wrap"><div class="empty">Page not found. <a data-l href="/">${t("home")}</a></div></div>`;
  } catch (e) { app.innerHTML = `<div class="wrap" style="padding:30px 16px"><div class="empty">${esc(e.message)}</div></div>`; }
  document.title = (S.biz.name || "Showroom") + (p === "/" ? " | Used Vehicles in Dar es Salaam" : "");
}

function renderNav(p) {
  const on = h => (p === h || (h !== "/" && p.startsWith(h)) ? "on" : "");
  const logo = S.biz.logo ? `<img src="${esc(S.biz.logo)}" alt="">` : `<span style="font-size:1.4rem">🚘</span>`;
  $("#topbar").innerHTML = `<div class="wrap"><a class="brand" data-l href="/">${logo}<span>${esc(S.biz.name || "")}</span></a>
   <nav class="menu" aria-label="Main"><a data-l class="${on("/")}" href="/">${t("home")}</a><a data-l class="${on("/vehicles")}" href="/vehicles">${t("vehicles")}</a>
   <a data-l href="/vehicles#cats" onclick="setTimeout(()=>document.getElementById('cats')?.scrollIntoView(),0)">${t("categories")}</a><a data-l href="/about">${t("about")}</a><a data-l href="/contact">${t("contact")}</a></nav>
   <span class="spacer"></span>
   ${S.deferredInstall ? `<button class="btn sm gold" id="installBtn">${t("install")}</button>` : ""}
   <a class="iconbtn" data-l href="/vehicles?focus=1" aria-label="${t("search")}">🔍</a>
   <button class="iconbtn" data-theme-toggle></button>
   <button class="lang" id="langBtn" aria-label="Language">${S.lang === "en" ? "SW" : "EN"}</button>
   <a class="iconbtn" data-l href="${S.user?.is_staff ? "/admin" : "/account"}" aria-label="${t("account")}">${S.user ? "👤" : "🔓"}</a></div>`;
  $("#bottomnav").innerHTML = `<a data-l class="${p === "/" ? "on" : ""}" href="/"><b>🏠</b>${t("home")}</a><a data-l class="${on("/vehicles")}" href="/vehicles"><b>🚗</b>${t("vehicles")}</a>
   <a data-l href="/vehicles?focus=1"><b>🔍</b>${t("search")}</a><a data-l class="${on("/account")}" href="/account"><b>♡</b>${t("saved")}</a><a data-l class="${on("/contact")}" href="/contact"><b>📞</b>${t("contact")}</a>`;
  Theme.sync();
  $("#langBtn").onclick = () => { S.lang = S.lang === "en" ? "sw" : "en"; localStorage.lang = S.lang; document.documentElement.lang = S.lang; route(); };
  const ib = $("#installBtn"); if (ib) ib.onclick = async () => { S.deferredInstall.prompt(); await S.deferredInstall.userChoice; S.deferredInstall = null; renderNav(location.pathname); };
}
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); S.deferredInstall = e; renderNav(location.pathname); });

// ---------- Shared components ----------
const waLink = v => `https://wa.me/${(S.biz.whatsapp || "").replace(/\D/g, "")}?text=${encodeURIComponent(`Hello, I am interested in ${v.title} - ${v.vehicle_id}. Is it still available?`)}`;
const specLine = v => [v.mileage != null ? v.mileage.toLocaleString() + " km" : "", v.engine_cc ? v.engine_cc + " cc" : "", v.transmission, v.fuel_type].filter(Boolean).join(" · ");
const skeleton = n => `<div class="grid">${'<div class="skel"></div>'.repeat(n)}</div>`;

function card(v) {
  return `<article class="card" data-vid="${esc(v.vehicle_id)}">
   <a class="ph" data-l href="/vehicles/${esc(v.vehicle_id)}">${v.cover ? `<img loading="lazy" src="${esc(v.cover)}" alt="${esc(v.title)}">` : ""}
    <span class="badge ${v.status}">${t(v.status)}</span>${v.video ? `<span class="vid">▶ Video</span>` : ""}</a>
   <div class="bd"><h3>${esc(v.title)}</h3><div class="price">${tzs(v.price)}</div><div class="specs">${esc(specLine(v))}</div>
    <div class="acts"><button class="iconbtn ${v.liked ? "on" : ""}" data-act="like" aria-label="Like" aria-pressed="${v.liked}">${v.liked ? "♥" : "♡"}</button><span class="cnt" data-lc>${v.likes_count}</span>
     <a class="iconbtn" data-l href="/vehicles/${esc(v.vehicle_id)}#comments" aria-label="${t("comments")}">💬</a><span class="cnt">${v.comments_count}</span>
     <button class="iconbtn ${v.saved ? "on" : ""}" data-act="save" aria-label="Save">${v.saved ? "★" : "☆"}</button>
     <button class="iconbtn" data-act="share" aria-label="${t("share")}">↗</button></div></div>
   <div class="row2"><a class="btn alt" data-l href="/vehicles/${esc(v.vehicle_id)}">${t("details")}</a><a class="btn wa" target="_blank" rel="noopener" href="${waLink(v)}">${t("whatsapp")}</a>
    <a class="btn alt" href="tel:${esc(S.biz.phone)}">${t("call")}</a></div></article>`;
}

async function shareVehicle(v) {
  const url = location.origin + "/vehicles/" + v.vehicle_id, text = `${v.title} - ${tzs(v.price)}`;
  if (navigator.share) {
    try {
      const d = { title: v.title, text, url };
      if (v.cover && navigator.canShare) { const b = await (await fetch(v.cover)).blob(), f = new File([b], "vehicle.jpg", { type: b.type }); if (navigator.canShare({ files: [f] })) d.files = [f]; }
      return await navigator.share(d);
    } catch (e) { if (e.name === "AbortError") return; }
  }
  const msg = encodeURIComponent(text + "\n" + url);
  $("#drawer").hidden = false;
  $("#drawer").innerHTML = `<div class="sheet"><h3>${t("share")}</h3><p>${esc(text)}</p><div style="display:grid;gap:8px">
   <a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/?text=${msg}">WhatsApp</a>
   <a class="btn alt" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}">Facebook</a>
   <button class="btn alt" id="cp">Copy link</button><button class="btn alt" id="cl">✕</button></div></div>`;
  $("#cp").onclick = () => { navigator.clipboard?.writeText(url); toast("Link copied"); $("#drawer").hidden = true; };
  $("#cl").onclick = () => $("#drawer").hidden = true;
}

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const c = b.closest("[data-vid]"), id = c?.dataset.vid; if (!id) return;
  if (b.dataset.act === "share") { const v = await api(`/vehicles/${id}/`); return shareVehicle(v); }
  if (!S.user) return needLogin();
  try {
    const r = await api(`/vehicles/${id}/${b.dataset.act}/`, { method: "POST" });
    if (b.dataset.act === "like") { b.classList.toggle("on", r.active); b.textContent = r.active ? "♥" : "♡"; const n = $("[data-lc]", c); if (n) n.textContent = r.count; }
    else { b.classList.toggle("on", r.active); b.textContent = r.active ? "★" : "☆"; toast(r.active ? "Saved" : "Removed"); }
  } catch (er) { toast(er.message); }
});

function recent(id) { if (!id) return JSON.parse(localStorage.recent || "[]"); const a = [id, ...recent().filter(x => x !== id)].slice(0, 8); localStorage.recent = JSON.stringify(a); }

// ---------- Home ----------
async function Home(app) {
  app.innerHTML = `<div class="hero"><div class="wrap"><div><span style="opacity:.8">${esc(S.biz.address)}</span><h1>${esc(S.biz.tagline)}</h1>
   <p>${esc(S.biz.name)}</p><form class="searchbar" id="hs" role="search"><input name="q" placeholder="${t("search_ph")}" aria-label="${t("search")}"><button class="btn gold">${t("search")}</button></form>
   <p style="margin-top:16px"><a class="btn gold" data-l href="/vehicles">${t("hero_cta")}</a></p></div><div id="heroFeat"><div class="slider"><div class="skel" style="height:100%;aspect-ratio:auto"></div></div></div></div></div>
   <div class="wrap" id="homeBody">${["latest", "featured", "popular"].map(k => `<section class="sec"><div class="sechead"><div><h2>${t(k)}</h2></div><a data-l href="/vehicles">${t("view_all")}</a></div><div id="s_${k}">${skeleton(4)}</div></section>`).join("")}
   <div id="recentSec"></div>
   <section class="sec" id="cats"><h2>${t("browse_cat")}</h2><div class="cats" style="margin-top:12px">${S.cats.map(c => `<a class="cat" data-l href="/vehicles?category=${c.slug}">${esc(c.name)}<small>${c.count} ${t("AVAILABLE").toLowerCase()}</small></a>`).join("")}</div></section>
   <section class="sec"><h2>${t("why")}</h2><div class="why" style="margin-top:12px">${[1, 2, 3, 4].map(i => `<div><b>${t("w" + i)}</b>${t("w" + i + "t")}</div>`).join("")}</div></section>
   <section class="sec" id="about"><h2>${t("about")}</h2><p>${esc(S.biz.about)}</p></section>
   <section class="sec" id="contact"><h2>${t("contact")}</h2>${contactBox()}</section></div>${footer()}`;
  $("#hs").onsubmit = e => { e.preventDefault(); go("/vehicles?q=" + encodeURIComponent(new FormData(e.target).get("q"))); };
  const [latest, feat, pop] = await Promise.all(["ordering=-created_at&page_size=8", "featured=1&page_size=8", "ordering=-likes_count&page_size=8"].map(q => api("/vehicles/?" + q)));
  const seen = new Set(), pool = [...feat.results, ...latest.results].filter(v => v.cover && !seen.has(v.id) && seen.add(v.id));
  heroSlider(pool.filter(v => v.status !== "SOLD").length ? pool.filter(v => v.status !== "SOLD") : pool); // real vehicles from the database
  [["latest", latest], ["featured", feat], ["popular", pop]].forEach(([k, d]) => $("#s_" + k).innerHTML = d.results.length ? `<div class="hscroll">${d.results.map(card).join("")}</div>` : `<div class="empty">${t("no_vehicles")}</div>`);
  const ids = recent(); if (ids.length) { const r = await api("/vehicles/?page_size=8&ids=" + ids.join(",")); if (r.results.length) $("#recentSec").innerHTML = `<section class="sec"><h2>${t("recent")}</h2><div class="hscroll" style="margin-top:12px">${r.results.map(card).join("")}</div></section>`; }
}
// Automatic hero slideshow: 3s fade, arrows, dots, pause on hover/focus, swipe on touch.
function heroSlider(list) {
  const box = $("#heroFeat"); if (!box) return;
  const items = list.slice(0, 6);
  if (!items.length) { box.innerHTML = `<div class="slider fallback"><div><h2>${t("soon")}</h2><p>${t("soon_t")}</p><a class="btn gold" data-l href="/contact">${t("contact")}</a></div></div>`; return; }
  box.innerHTML = `<div class="slider" id="sl" role="region" aria-roledescription="carousel" aria-label="Featured vehicles">${items.map((v, i) =>
    `<a class="slide${i ? "" : " on"}" data-l href="/vehicles/${esc(v.vehicle_id)}" aria-label="${esc(v.title)}"><img ${i ? `data-src="${esc(v.cover)}"` : `src="${esc(v.cover)}" fetchpriority="high"`} alt="${esc(v.title)}">
     <div class="cap"><span class="badge ${v.status}" style="position:static;display:inline-block;margin-bottom:6px">${t(v.status)}</span><br><b>${esc(v.title)}</b><br>${tzs(v.price)}<br><span class="btn gold sm">${t("details")}</span></div></a>`).join("")}
   ${items.length > 1 ? `<button class="sl-n l" aria-label="Previous slide">‹</button><button class="sl-n r" aria-label="Next slide">›</button><div class="dots">${items.map((_, i) => `<button class="${i ? "" : "on"}" data-d="${i}" aria-label="Slide ${i + 1}"></button>`).join("")}</div>` : ""}</div>`;
  if (items.length < 2) return;
  const sl = $("#sl"), slides = $$(".slide", sl), dots = $$("[data-d]", sl); let cur = 0, paused = false;
  const load = i => { const im = $("img[data-src]", slides[i % slides.length]); if (im) { im.src = im.dataset.src; im.removeAttribute("data-src"); } };
  const show = n => { cur = (n + slides.length) % slides.length; load(cur); load(cur + 1); slides.forEach((s, i) => s.classList.toggle("on", i === cur)); dots.forEach((d, i) => d.classList.toggle("on", i === cur)); };
  load(1);
  $(".sl-n.l", sl).onclick = () => show(cur - 1); $(".sl-n.r", sl).onclick = () => show(cur + 1);
  dots.forEach(d => d.onclick = () => show(+d.dataset.d));
  ["mouseenter", "focusin"].forEach(ev => sl.addEventListener(ev, () => paused = true));
  ["mouseleave", "focusout"].forEach(ev => sl.addEventListener(ev, () => paused = false));
  let sx = 0; sl.addEventListener("touchstart", e => { sx = e.touches[0].clientX; paused = true; }, { passive: true });
  sl.addEventListener("touchend", e => { const d = e.changedTouches[0].clientX - sx; if (Math.abs(d) > 45) show(cur + (d < 0 ? 1 : -1)); paused = false; });
  S.slideTimer = setInterval(() => { if (!paused && !document.hidden) show(cur + 1); }, 3000);
}
const contactBox = () => `<div class="contactbox"><div>📍 ${esc(S.biz.address)}</div><div>🕒 ${esc(S.biz.opening_hours)}</div><div>📞 ${esc(S.biz.phone)}</div>
 <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/${(S.biz.whatsapp || "").replace(/\D/g, "")}">${t("whatsapp")}</a><a class="btn alt" href="tel:${esc(S.biz.phone)}">${t("call")}</a></div></div>`;
const footer = () => `<footer><div class="wrap"><b style="color:#fff">${esc(S.biz.name)}</b><br>${esc(S.biz.address)}<br>${[["instagram", "Instagram"], ["facebook", "Facebook"], ["tiktok", "TikTok"]].filter(([k]) => S.biz[k]).map(([k, n]) => `<a target="_blank" rel="noopener" href="${esc(S.biz[k])}">${n}</a>`).join(" · ")}<br>© ${new Date().getFullYear()} ${esc(S.biz.name)}</div></footer>`;

// ---------- Browse / search / filters ----------
async function Browse(app, sp) {
  const f = { category: sp.get("category") || "all", q: sp.get("q") || "", ordering: "-created_at" };
  ["brand", "year_min", "year_max", "price_min", "price_max", "condition", "available"].forEach(k => sp.get(k) && (f[k] = sp.get(k)));
  let page = 1;
  app.innerHTML = `<div class="wrap" style="padding-top:14px"><form class="searchbar" style="border:1px solid var(--line);max-width:none" id="bs" role="search"><input id="q" name="q" value="${esc(f.q)}" placeholder="${t("search_ph")}" aria-label="${t("search")}" autocomplete="off"><button class="btn">${t("search")}</button></form>
   <div class="chips" role="tablist"><button class="chip" data-c="all">${t("all")}</button>${S.cats.map(c => `<button class="chip" data-c="${c.slug}">${esc(c.name)}</button>`).join("")}<select id="sort" class="chip" style="margin-left:auto;width:auto" aria-label="Sort"><option value="-created_at">${t("sort_new")}</option><option value="price">${t("sort_low")}</option><option value="-price">${t("sort_high")}</option></select><button class="chip" id="fbtn">⚙ ${t("filters")}</button></div>
   <div id="list">${skeleton(8)}</div><div class="viewall" id="more"></div></div>${footer()}`;
  if (sp.get("focus")) $("#q").focus();
  const mark = () => $$(".chip[data-c]").forEach(c => c.classList.toggle("on", c.dataset.c === f.category));
  const load = async (append) => {
    if (!append) { page = 1; $("#list").innerHTML = skeleton(8); }
    const qs = new URLSearchParams({ ...f, page, page_size: 12 }); if (f.category === "all") qs.delete("category");
    try {
      const d = await api("/vehicles/?" + qs);
      if (!append) $("#list").innerHTML = d.results.length ? `<div class="grid"></div>` : `<div class="empty">${t("no_vehicles")}<br><button class="btn alt sm" id="clr" style="margin-top:10px">${t("clear")}</button></div>`;
      if ($("#clr")) $("#clr").onclick = () => { Object.keys(f).forEach(k => delete f[k]); Object.assign(f, { category: "all", q: "", ordering: "-created_at" }); $("#q").value = ""; $("#sort").value = "-created_at"; mark(); load(); };
      $(".grid", $("#list"))?.insertAdjacentHTML("beforeend", d.results.map(card).join(""));
      $("#more").innerHTML = d.next ? `<button class="btn alt" id="lm">${t("load_more")}</button>` : "";
      if (d.next) $("#lm").onclick = () => { page++; load(true); };
    } catch (e) { $("#list").innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  };
  $("#sort").value = f.ordering; $("#sort").onchange = e => { f.ordering = e.target.value; load(); };
  $("#bs").onsubmit = e => { e.preventDefault(); f.q = $("#q").value.trim(); load(); };
  let tm; $("#q").oninput = () => { clearTimeout(tm); tm = setTimeout(() => { f.q = $("#q").value.trim(); load(); }, 350); };
  $$(".chip[data-c]").forEach(c => c.onclick = () => { f.category = c.dataset.c; mark(); load(); });
  $("#fbtn").onclick = () => {
    $("#drawer").hidden = false;
    $("#drawer").innerHTML = `<div class="sheet"><h3>${t("filters")}</h3><div class="form2">
     <div><label>Brand</label><input id="f_brand" value="${esc(f.brand || "")}"></div><div><label>Condition</label><select id="f_condition"><option value="">Any</option>${["Used - Excellent", "Used - Good", "Used - Fair"].map(c => `<option ${f.condition === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
     <div><label>Year from</label><input id="f_year_min" type="number" value="${f.year_min || ""}"></div><div><label>Year to</label><input id="f_year_max" type="number" value="${f.year_max || ""}"></div>
     <div><label>Min price (TZS)</label><input id="f_price_min" type="number" value="${f.price_min || ""}"></div><div><label>Max price (TZS)</label><input id="f_price_max" type="number" value="${f.price_max || ""}"></div></div>
     <label><input type="checkbox" id="f_available" style="width:auto" ${f.available ? "checked" : ""}> Available only</label>
     <div style="display:flex;gap:8px;margin-top:14px"><button class="btn" id="fa" style="flex:1">${t("apply")}</button><button class="btn alt" id="fr">${t("reset")}</button></div></div>`;
    $("#fa").onclick = () => { ["brand", "condition", "year_min", "year_max", "price_min", "price_max"].forEach(k => { const v = $("#f_" + k).value.trim(); v ? f[k] = v : delete f[k]; }); $("#f_available").checked ? f.available = "1" : delete f.available; $("#drawer").hidden = true; load(); };
    $("#fr").onclick = () => { ["brand", "condition", "year_min", "year_max", "price_min", "price_max", "available"].forEach(k => delete f[k]); $("#drawer").hidden = true; load(); };
  };
  $("#drawer").onclick = e => { if (e.target.id === "drawer") e.target.hidden = true; };
  mark(); load();
}

// ---------- Details ----------
async function Detail(app, id) {
  app.innerHTML = `<div class="wrap"><div class="detail"><div class="skel"></div><div class="skel"></div></div></div>`;
  let v; try { v = await api(`/vehicles/${encodeURIComponent(id)}/`); } catch (e) { throw new Error(e.status === 404 ? t("not_found") : e.message); }
  recent(v.vehicle_id); document.title = `${v.title} - ${tzs(v.price)} | ${S.biz.name}`;
  const imgs = v.images.map(i => i.image);
  const rows = [["Vehicle ID", v.vehicle_id], ["Type", v.category_name], ["Brand", v.brand], ["Model", v.model], ["Year", v.year], ["Condition", v.condition], ["Mileage", v.mileage != null ? v.mileage.toLocaleString() + " km" : ""],
    ["Engine", v.engine_cc ? v.engine_cc + " cc" : ""], ["Fuel", v.fuel_type], ["Transmission", v.transmission], ["Color", v.color], ...Object.entries(v.extra_specs || {})].filter(r => r[1]);
  app.innerHTML = `<div class="wrap"><div class="detail"><div><div class="gallery"><div class="gtrack" id="gt">${imgs.map((s, i) => `<img src="${esc(s)}" data-i="${i}" alt="${esc(v.title)} photo ${i + 1}" ${i ? 'loading="lazy"' : ""}>`).join("") || '<div style="aspect-ratio:4/3"></div>'}${v.video ? `<video src="${esc(v.video)}" controls preload="none" playsinline></video>` : ""}</div>
     <button class="gnav l" id="gp" aria-label="Previous">‹</button><button class="gnav r" id="gn" aria-label="Next">›</button><span class="badge ${v.status}">${t(v.status)}</span></div>
     ${imgs.length > 1 ? `<div class="gthumbs">${imgs.map((s, i) => `<img src="${esc(s)}" data-t="${i}" alt="Photo ${i + 1}" class="${i ? "" : "on"}">`).join("")}</div>` : ""}</div>
    <div data-vid="${esc(v.vehicle_id)}"><h1 style="margin:0">${esc(v.title)}</h1><div class="specs">ID: ${esc(v.vehicle_id)}</div><div class="price" style="font-size:1.7rem;margin:6px 0">${tzs(v.price)}</div>
     <div class="acts"><button class="iconbtn ${v.liked ? "on" : ""}" data-act="like" aria-label="Like">${v.liked ? "♥" : "♡"}</button><span class="cnt" data-lc>${v.likes_count}</span><button class="iconbtn ${v.saved ? "on" : ""}" data-act="save" aria-label="Save">${v.saved ? "★" : "☆"}</button><button class="iconbtn" data-act="share" aria-label="Share">↗</button></div>
     <div class="sticky-cta"><a class="btn wa" target="_blank" rel="noopener" href="${waLink(v)}">${t("whatsapp")}</a><a class="btn alt" href="tel:${esc(S.biz.phone)}">${t("call")}</a></div>
     <p>${esc(v.description)}</p><table class="spec-t">${rows.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join("")}</table>
     <p>📍 ${esc(S.biz.address)}<br>🕒 ${esc(S.biz.opening_hours)}</p>
     <h3>${t("send_inquiry")}</h3><form id="inq"><label class="req">${t("name")}</label><input name="name" required maxlength="100" value="${esc(S.user?.name || "")}"><label class="req">${t("phone")}</label><input name="phone" required maxlength="30" inputmode="tel" value="${esc(S.user?.profile.phone || "")}">
      <label class="req">${t("message")}</label><textarea name="message" required rows="3" maxlength="1000">Hello, I am interested in ${esc(v.title)} (${esc(v.vehicle_id)}).</textarea><div class="err" id="ie"></div><button class="btn" style="margin-top:8px">${t("send_inquiry")}</button></form></div></div>
    <section class="sec" id="comments"><h2>${t("comments")}</h2><div id="cl"></div>${S.user ? `<form id="cf" style="display:flex;gap:8px;margin-top:10px"><input name="text" required minlength="2" maxlength="500" placeholder="${t("comments")}..." aria-label="${t("comments")}"><button class="btn">OK</button></form>` : `<p><a data-l href="/account">${t("login")}</a> – ${t("need_login")}</p>`}</section>
    <section class="sec"><h2>${t("similar")}</h2><div id="rel"></div></section></div>${footer()}`;
  // gallery
  const gt = $("#gt"), n = imgs.length; let cur = 0;
  const show = i => { cur = (i + n) % n; gt.scrollTo({ left: gt.clientWidth * cur, behavior: "smooth" }); $$("[data-t]").forEach(x => x.classList.toggle("on", +x.dataset.t === cur)); };
  $("#gp").onclick = () => show(cur - 1); $("#gn").onclick = () => show(cur + 1);
  gt.onscroll = () => { const i = Math.round(gt.scrollLeft / gt.clientWidth); if (i !== cur) { cur = i; $$("[data-t]").forEach(x => x.classList.toggle("on", +x.dataset.t === cur)); } };
  $$("[data-t]").forEach(x => x.onclick = () => show(+x.dataset.t));
  $$("#gt img").forEach(x => x.onclick = () => lightbox(imgs, +x.dataset.i));
  // inquiry
  $("#inq").onsubmit = async e => {
    e.preventDefault(); const b = $("button", e.target); b.disabled = true; $("#ie").textContent = "";
    try { await api("/inquiries/", { method: "POST", body: { ...Object.fromEntries(new FormData(e.target)), vehicle: v.vehicle_id } }); toast(t("sent")); e.target.reset(); }
    catch (er) { $("#ie").textContent = er.message; } b.disabled = false;
  };
  // comments
  const loadC = async () => { const c = await api(`/vehicles/${v.vehicle_id}/comments/`);
    $("#cl").innerHTML = c.length ? c.map(x => `<div class="cmt"><b>${esc(x.user)}</b> <small>${dt(x.created_at)}</small>${x.mine ? ` <button class="btn sm alt" data-del="${x.id}">✕</button>` : ""}<div>${esc(x.text)}</div></div>`).join("") : `<div class="empty">${t("no_comments")}</div>`;
    $$("[data-del]").forEach(b => b.onclick = async () => { await api(`/comments/${b.dataset.del}/remove/`, { method: "DELETE" }); loadC(); }); };
  loadC();
  if ($("#cf")) $("#cf").onsubmit = async e => { e.preventDefault(); try { await api(`/vehicles/${v.vehicle_id}/comments/`, { method: "POST", body: { text: new FormData(e.target).get("text") } }); e.target.reset(); loadC(); } catch (er) { toast(er.message); } };
  const rel = await api(`/vehicles/${v.vehicle_id}/related/`);
  $("#rel").innerHTML = rel.length ? `<div class="hscroll">${rel.map(card).join("")}</div>` : `<div class="empty">${t("no_vehicles")}</div>`;
  if (location.hash === "#comments") $("#comments").scrollIntoView();
}

function lightbox(imgs, i) {
  const lb = $("#lightbox"); lb.hidden = false;
  const draw = () => lb.innerHTML = `<img src="${esc(imgs[i])}" alt=""><button style="top:14px;right:14px" aria-label="Close" id="lx">✕</button>${imgs.length > 1 ? `<button style="left:10px" id="lp" aria-label="Previous">‹</button><button style="right:10px" id="ln" aria-label="Next">›</button>` : ""}`;
  const bind = () => { $("#lx").onclick = close; if ($("#lp")) { $("#lp").onclick = () => { i = (i - 1 + imgs.length) % imgs.length; draw(); bind(); }; $("#ln").onclick = () => { i = (i + 1) % imgs.length; draw(); bind(); }; } };
  const close = () => { lb.hidden = true; document.removeEventListener("keydown", key); };
  const key = e => { if (e.key === "Escape") close(); if (e.key === "ArrowLeft") $("#lp")?.click(); if (e.key === "ArrowRight") $("#ln")?.click(); };
  let sx = 0; lb.ontouchstart = e => sx = e.touches[0].clientX; lb.ontouchend = e => { const d = e.changedTouches[0].clientX - sx; if (Math.abs(d) > 50) (d > 0 ? $("#lp") : $("#ln"))?.click(); };
  document.addEventListener("keydown", key); draw(); bind(); $("#lx").focus();
}

// ---------- Account ----------
async function Account(app) {
  if (!S.user) {
    let mode = "login";
    const draw = () => { app.innerHTML = `<div class="wrap" style="max-width:420px;padding:30px 16px"><div class="tabs"><button class="${mode === "login" ? "on" : ""}" data-m="login">${t("login")}</button><button class="${mode === "register" ? "on" : ""}" data-m="register">${t("register")}</button></div>
      <form id="af">${mode === "register" ? `<label class="req">${t("name")}</label><input name="name" required maxlength="60">` : ""}<label class="req">${t("email")}</label><input name="email" type="email" required autocomplete="email">
      <label class="req">${t("password")}</label><input name="password" type="password" required minlength="${mode === "register" ? 8 : 1}" autocomplete="${mode === "login" ? "current-password" : "new-password"}"><div class="err" id="ae"></div><button class="btn" style="width:100%;margin-top:10px">${mode === "login" ? t("login") : t("register")}</button></form>
      <p class="specs">Optional - you can browse, call and use WhatsApp without an account.</p></div>`;
      $$("[data-m]").forEach(b => b.onclick = () => { mode = b.dataset.m; draw(); });
      $("#af").onsubmit = async e => { e.preventDefault(); const b = $("button.btn", e.target); b.disabled = true;
        try { S.user = await api(mode === "login" ? "/auth/login/" : "/auth/register/", { method: "POST", body: Object.fromEntries(new FormData(e.target)) }); toast("Welcome " + S.user.name); go(S.user.is_staff ? "/admin" : "/account"); }
        catch (er) { $("#ae").textContent = er.message; b.disabled = false; } }; };
    return draw();
  }
  const [saved, inq] = await Promise.all([api("/me/saved/"), api("/me/inquiries/")]);
  const p = S.user.profile;
  app.innerHTML = `<div class="wrap" style="padding-top:18px"><h2>👤 ${esc(S.user.name)}</h2><div class="specs">${esc(S.user.email)}</div>
   <h3>${t("saved")}</h3>${saved.length ? `<div class="grid">${saved.map(card).join("")}</div>` : `<div class="empty">${t("no_saved")}</div>`}
   <h3>Inquiries</h3>${inq.length ? `<div class="tblw"><table class="tbl"><tr><th>Date</th><th>Vehicle</th><th>Message</th><th>Status</th></tr>${inq.map(i => `<tr><td>${dt(i.created_at)}</td><td>${esc(i.vehicle)} ${esc(i.vehicle_title)}</td><td>${esc(i.message)}</td><td>${i.status}</td></tr>`).join("")}</table></div>` : `<div class="empty">${t("no_inq")}</div>`}
   <h3>Profile & notifications</h3><form id="pf" style="max-width:420px"><label>${t("name")}</label><input name="name" value="${esc(S.user.name)}" required><label>${t("phone")}</label><input name="phone" value="${esc(p.phone)}">
    <label><input type="checkbox" name="email_notifications" style="width:auto" ${p.email_notifications ? "checked" : ""}> Email me about new vehicles</label>
    <label><input type="checkbox" name="marketing_emails" style="width:auto" ${p.marketing_emails ? "checked" : ""}> Email me special offers & news</label>
    <button class="btn" style="margin-top:10px">Save</button> <button type="button" class="btn alt" id="lo">${t("logout")}</button></form></div>${footer()}`;
  $("#pf").onsubmit = async e => { e.preventDefault(); const f = new FormData(e.target);
    try { S.user = await api("/me/", { method: "PATCH", body: { name: f.get("name"), profile: { phone: f.get("phone"), email_notifications: f.has("email_notifications"), marketing_emails: f.has("marketing_emails") } } }); toast("Saved"); } catch (er) { toast(er.message); } };
  $("#lo").onclick = async () => { await api("/auth/logout/", { method: "POST" }); S.user = null; toast("Logged out"); go("/"); };
}

// ---------- Boot ----------
(async function init() {
  document.documentElement.lang = S.lang;
  [S.biz, S.cats, S.user] = await Promise.all([api("/business/"), api("/categories/"), api("/me/")]).catch(() => [{}, [], null]);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  route();
})();