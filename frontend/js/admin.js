"use strict";
// Owner dashboard. All actions call the API; the backend enforces admin-only access.
const SPEC_FIELDS = { // which optional spec fields to show per category
  cars: ["mileage", "engine_cc", "fuel_type", "transmission", "color"],
  motorcycles: ["engine_cc", "mileage", "transmission", "color"],
  bajaji: ["engine_cc", "fuel_type", "mileage", "color"],
  guta: ["engine_cc", "fuel_type", "mileage", "color"],
};
async function Admin(app) {
  if (!S.user?.is_staff) { app.innerHTML = `<div class="wrap" style="padding:30px 16px"><div class="empty">Admin access only. <a data-l href="/account">${t("login")}</a></div></div>`; return; }
  const tabs = [["dash", "Dashboard"], ["inv", "Inventory"], ["add", "+ Add vehicle"], ["inq", "Inquiries"], ["com", "Comments"], ["biz", "Business"]];
  let tab = sessionStorage.adminTab || "dash";
  const open = (k, arg) => { tab = k; sessionStorage.adminTab = k; draw(arg); };
  const body = () => $("#ab");
  const draw = async (arg) => {
    app.innerHTML = `<div class="wrap" style="padding-top:14px"><h2>Owner dashboard</h2><div class="tabs">${tabs.map(([k, n]) => `<button data-t="${k}" class="${k === tab ? "on" : ""}">${n}</button>`).join("")}<button id="alo">${t("logout")}</button></div><div id="ab">${skeleton(2)}</div></div>`;
    $$("[data-t]").forEach(b => b.onclick = () => open(b.dataset.t));
    $("#alo").onclick = async () => { await api("/auth/logout/", { method: "POST" }); S.user = null; go("/"); };
    try { await ({ dash, inv, add: () => form(null), inq, com, biz, edit: () => form(arg) }[tab])(); } catch (e) { body().innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  };
  const confirmBox = msg => confirm(msg);

  async function dash() {
    const s = await api("/admin/stats/");
    body().innerHTML = `<div class="stats">${[["Total vehicles", s.total], ["Available", s.available], ["Reserved", s.reserved], ["Sold", s.sold], ["Total inquiries", s.inquiries], ["New inquiries", s.new_inquiries]].map(([n, v]) => `<div class="stat"><b>${v}</b>${n}</div>`).join("")}</div>
     <h3>Recent activity</h3>${s.activity.length ? `<div class="tblw"><table class="tbl">${s.activity.map(a => `<tr><td>${dt(a.at)}</td><td>${esc(a.action)}</td><td>${esc(a.detail)}</td></tr>`).join("")}</table></div>` : '<div class="empty">No activity yet.</div>'}
     <p><button class="btn" id="g1">+ Add vehicle</button> <button class="btn alt" id="g2">Inventory</button></p>`;
    $("#g1").onclick = () => open("add"); $("#g2").onclick = () => open("inv");
  }

  async function inv() {
    const all = (await api("/vehicles/?page_size=100&ordering=-created_at")).results;
    const render = () => {
      const q = $("#iq").value.toLowerCase(), st = $("#is").value;
      const rows = all.filter(v => (!st || v.status === st) && (`${v.vehicle_id} ${v.title} ${v.color}`.toLowerCase().includes(q)));
      $("#it").innerHTML = rows.length ? rows.map(v => `<tr data-id="${esc(v.vehicle_id)}"><td>${v.cover ? `<img src="${esc(v.cover)}" alt="">` : ""}</td><td><b>${esc(v.vehicle_id)}</b></td><td>${esc(v.title)}<br><small>${esc(v.category_name)}</small></td><td>${tzs(v.price)}</td>
        <td><select data-s aria-label="Status">${["AVAILABLE", "RESERVED", "SOLD"].map(s => `<option ${v.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></td>
        <td><input type="checkbox" data-f style="width:auto" ${v.featured ? "checked" : ""} aria-label="Featured"></td>
        <td style="white-space:nowrap"><a class="btn sm alt" data-l href="/vehicles/${esc(v.vehicle_id)}">View</a> <button class="btn sm" data-e>Edit</button> <button class="btn sm danger" data-d>Delete</button></td></tr>`).join("") : `<tr><td colspan="7"><div class="empty">${t("no_vehicles")}</div></td></tr>`;
      $$("#it tr[data-id]").forEach(tr => { const id = tr.dataset.id, v = all.find(x => x.vehicle_id === id);
        $("[data-s]", tr).onchange = async e => { try { await api(`/vehicles/${id}/`, { method: "PATCH", body: { status: e.target.value } }); v.status = e.target.value; toast("Status updated"); } catch (er) { toast(er.message); } };
        $("[data-f]", tr).onchange = async e => { await api(`/vehicles/${id}/`, { method: "PATCH", body: { featured: e.target.checked } }); toast("Updated"); };
        $("[data-e]", tr).onclick = () => open("edit", id);
        $("[data-d]", tr).onclick = async () => { if (!confirmBox(`Delete ${v.title} (${id})? This removes it from the website.`)) return; await api(`/vehicles/${id}/`, { method: "DELETE" }); all.splice(all.indexOf(v), 1); render(); toast("Deleted"); }; });
    };
    body().innerHTML = `<div style="display:flex;gap:8px;margin-bottom:10px"><input id="iq" placeholder="Search by ID, brand, model..." aria-label="Search inventory"><select id="is" style="width:auto"><option value="">All status</option><option>AVAILABLE</option><option>RESERVED</option><option>SOLD</option></select></div>
     <div class="tblw"><table class="tbl"><tr><th></th><th>ID</th><th>Vehicle</th><th>Price</th><th>Status</th><th>★</th><th></th></tr><tbody id="it"></tbody></table></div>`;
    $("#iq").oninput = render; $("#is").onchange = render; render();
  }

  async function form(id) {
    const v = id ? await api(`/vehicles/${id}/`) : { category: "cars", status: "AVAILABLE", condition: "Used - Good", images: [], extra_specs: {} };
    const L = { mileage: "Mileage (km)", engine_cc: "Engine / CC", fuel_type: "Fuel type", transmission: "Transmission", color: "Color" };
    const input = k => k === "fuel_type" ? `<select name="fuel_type"><option value="">-</option>${["Petrol", "Diesel", "Hybrid", "Electric"].map(o => `<option ${v.fuel_type === o ? "selected" : ""}>${o}</option>`).join("")}</select>`
      : k === "transmission" ? `<select name="transmission"><option value="">-</option>${["Manual", "Automatic"].map(o => `<option ${v.transmission === o ? "selected" : ""}>${o}</option>`).join("")}</select>`
      : `<input name="${k}" ${["mileage", "engine_cc"].includes(k) ? 'type="number" min="0"' : ""} value="${esc(v[k] ?? "")}">`;
    body().innerHTML = `<form id="vf"><div class="form2">
     <div><label class="req">Vehicle type</label><select name="category" id="vc">${S.cats.map(c => `<option value="${c.slug}" ${v.category === c.slug ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
     <div><label>Vehicle ID <small>(leave empty = automatic)</small></label><input name="vehicle_id" value="${esc(v.vehicle_id || "")}" ${id ? "readonly" : ""}></div>
     <div><label class="req">Brand</label><input name="brand" required value="${esc(v.brand || "")}"></div><div><label class="req">Model</label><input name="model" required value="${esc(v.model || "")}"></div>
     <div><label class="req">Year</label><input name="year" type="number" required min="1960" max="2100" value="${v.year || ""}"></div><div><label class="req">Price (TZS)</label><input name="price" type="number" required min="1" value="${v.price ? Math.round(v.price) : ""}"></div>
     <div><label class="req">Condition</label><select name="condition">${["Used - Excellent", "Used - Good", "Used - Fair"].map(o => `<option ${v.condition === o ? "selected" : ""}>${o}</option>`).join("")}</select></div>
     <div><label class="req">Availability</label><select name="status">${["AVAILABLE", "RESERVED", "SOLD"].map(o => `<option ${v.status === o ? "selected" : ""}>${o}</option>`).join("")}</select></div></div>
     <div class="form2" id="specs">${Object.keys(L).map(k => `<div data-sp="${k}"><label>${L[k]} <small>(optional)</small></label>${input(k)}</div>`).join("")}</div>
     <label>Description</label><textarea name="description" rows="4">${esc(v.description || "")}</textarea>
     <label><input type="checkbox" name="featured" style="width:auto" ${v.featured ? "checked" : ""}> Featured vehicle</label>
     <div id="imgs"></div>
     <label>Add photos <small>(JPG/PNG/WEBP, max 8MB each, optional)</small></label><input type="file" id="fi" accept="image/jpeg,image/png,image/webp" multiple>
     <label>Video <small>(MP4/WEBM, max 50MB, optional)</small></label><input type="file" id="fv" accept="video/mp4,video/webm,video/quicktime">${v.video ? `<p>Current video uploaded. <button type="button" class="btn sm danger" id="rv">Remove video</button></p>` : ""}
     ${id ? "" : `<label><input type="checkbox" id="nt" style="width:auto"> Email subscribers about this new vehicle</label>`}
     <div class="err" id="fe"></div><button class="btn" id="fs" style="margin-top:12px">${id ? "Save changes" : "Publish vehicle"}</button></form>`;
    const syncSpecs = () => { const show = SPEC_FIELDS[$("#vc").value] || []; $$("[data-sp]").forEach(d => d.hidden = !show.includes(d.dataset.sp)); };
    $("#vc").onchange = syncSpecs; syncSpecs();
    const paintImgs = () => { $("#imgs").innerHTML = v.images.length ? `<label>Photos (first = shown first)</label><div class="imgm">${v.images.map((im, i) => `<div><img src="${esc(im.image)}" alt="" class="${im.is_cover ? "on" : ""}">
       <button type="button" class="btn sm alt" data-mv="${i},-1">←</button><button type="button" class="btn sm alt" data-mv="${i},1">→</button><br><button type="button" class="btn sm ${im.is_cover ? "gold" : "alt"}" data-cv="${im.id}">${im.is_cover ? "Cover ✓" : "Set cover"}</button><button type="button" class="btn sm danger" data-rm="${im.id}">✕</button></div>`).join("")}</div>` : "";
      $$("[data-mv]").forEach(b => b.onclick = async () => { const [i, d] = b.dataset.mv.split(",").map(Number), j = i + d; if (j < 0 || j >= v.images.length) return; [v.images[i], v.images[j]] = [v.images[j], v.images[i]]; await api(`/vehicles/${id}/images/reorder/`, { method: "POST", body: { order: v.images.map(x => x.id) } }); paintImgs(); });
      $$("[data-cv]").forEach(b => b.onclick = async () => { await api(`/images/${b.dataset.cv}/cover/`, { method: "POST" }); v.images.forEach(x => x.is_cover = x.id == b.dataset.cv); paintImgs(); });
      $$("[data-rm]").forEach(b => b.onclick = async () => { if (!confirmBox("Remove this photo?")) return; await api(`/images/${b.dataset.rm}/`, { method: "DELETE" }); v.images = v.images.filter(x => x.id != b.dataset.rm); if (v.images.length && !v.images.some(x => x.is_cover)) v.images[0].is_cover = true; paintImgs(); }); };
    if (id) paintImgs();
    if ($("#rv")) $("#rv").onclick = async () => { await api(`/vehicles/${id}/video/`, { method: "DELETE" }); toast("Video removed"); $("#rv").parentElement.remove(); };
    $("#vf").onsubmit = async e => {
      e.preventDefault(); const b = $("#fs"); b.disabled = true; b.textContent = "Saving..."; $("#fe").textContent = "";
      const f = new FormData(e.target), data = { featured: f.has("featured") };
      for (const [k, val] of f.entries()) { if (k === "featured") continue; data[k] = val; }
      const shown = SPEC_FIELDS[data.category] || [];
      ["mileage", "engine_cc"].forEach(k => data[k] = shown.includes(k) && data[k] !== "" ? +data[k] : null);
      ["fuel_type", "transmission", "color"].forEach(k => { if (!shown.includes(k)) data[k] = ""; });
      if (id) delete data.vehicle_id;
      try {
        const saved = id ? await api(`/vehicles/${id}/`, { method: "PATCH", body: data }) : await api("/vehicles/", { method: "POST", body: data });
        const files = $("#fi").files; if (files.length) { const fd = new FormData(); [...files].forEach(x => fd.append("images", x)); b.textContent = "Uploading photos..."; await api(`/vehicles/${saved.vehicle_id}/images/`, { method: "POST", form: fd }); }
        if ($("#fv").files[0]) { const fd = new FormData(); fd.append("video", $("#fv").files[0]); b.textContent = "Uploading video..."; await api(`/vehicles/${saved.vehicle_id}/video/`, { method: "POST", form: fd }); }
        if ($("#nt")?.checked) await api(`/vehicles/${saved.vehicle_id}/notify/`, { method: "POST" });
        toast(id ? "Changes saved" : `Published ${saved.vehicle_id}`); open("inv");
      } catch (er) { $("#fe").textContent = er.message; b.disabled = false; b.textContent = id ? "Save changes" : "Publish vehicle"; }
    };
  }

  async function inq() {
    const d = (await api("/inquiries/?page_size=100")).results;
    body().innerHTML = d.length ? `<div class="tblw"><table class="tbl"><tr><th>Date</th><th>Customer</th><th>Phone</th><th>Vehicle</th><th>Message</th><th>Status</th></tr>${d.map(i => `<tr><td>${dt(i.created_at)}</td><td>${esc(i.name)}</td><td><a href="tel:${esc(i.phone)}">${esc(i.phone)}</a></td><td><b>${esc(i.vehicle)}</b><br>${esc(i.vehicle_title)}</td><td>${esc(i.message)}</td>
      <td><select data-i="${i.id}">${["NEW", "CONTACTED", "CLOSED"].map(s => `<option ${i.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></td></tr>`).join("")}</table></div>` : `<div class="empty">${t("no_inq")}</div>`;
    $$("[data-i]").forEach(s => s.onchange = async () => { await api(`/inquiries/${s.dataset.i}/`, { method: "PATCH", body: { status: s.value } }); toast("Status updated"); });
  }

  async function com() {
    const d = (await api("/comments/?page_size=100")).results;
    body().innerHTML = d.length ? `<div class="tblw"><table class="tbl"><tr><th>Date</th><th>User</th><th>Vehicle</th><th>Comment</th><th></th></tr>${d.map(c => `<tr><td>${dt(c.created_at)}</td><td>${esc(c.user)}</td><td>${esc(c.vehicle_id)}</td><td>${esc(c.text)}</td><td><button class="btn sm danger" data-c="${c.id}">Delete</button></td></tr>`).join("")}</table></div>` : `<div class="empty">${t("no_comments")}</div>`;
    $$("[data-c]").forEach(b => b.onclick = async () => { if (!confirmBox("Delete this comment?")) return; await api(`/comments/${b.dataset.c}/remove/`, { method: "DELETE" }); com(); });
  }

  async function biz() {
    const b = await api("/business/");
    const F = [["name", "Business name"], ["tagline", "Tagline"], ["phone", "Phone"], ["whatsapp", "WhatsApp (digits, e.g. 2557xxxxxxxx)"], ["email", "Email"], ["address", "Address"], ["opening_hours", "Opening hours"], ["instagram", "Instagram URL"], ["facebook", "Facebook URL"], ["tiktok", "TikTok URL"]];
    body().innerHTML = `<form id="bf" style="max-width:560px">${b.logo ? `<img src="${esc(b.logo)}" alt="Logo" style="height:60px">` : ""}<label>Logo</label><input type="file" name="logo" accept="image/*">
     ${F.map(([k, n]) => `<label>${n}</label><input name="${k}" value="${esc(b[k])}">`).join("")}<label>About</label><textarea name="about" rows="4">${esc(b.about)}</textarea><div class="err" id="be"></div><button class="btn" style="margin-top:10px">Save</button></form>`;
    $("#bf").onsubmit = async e => { e.preventDefault(); try { const f = new FormData(e.target); if (!f.get("logo")?.size) f.delete("logo"); S.biz = await api("/business/", { method: "PATCH", form: f }); toast("Business info saved"); renderNav(location.pathname); } catch (er) { $("#be").textContent = er.message; } };
  }
  draw();
}
