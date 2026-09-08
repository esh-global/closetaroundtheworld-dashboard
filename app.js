(function(){
  "use strict";

  var PLATFORM_FILES = [
    {platform:"Poshmark", file:"data/poshmark.csv"},
    {platform:"Mercari", file:"data/mercari.csv"},
    {platform:"Depop", file:"data/depop.csv"},
    {platform:"Vinted", file:"data/vinted.csv"}
  ];

  var FIELD_ALIASES = {
    brand: ["brand","designer","brand name","label"],
    type: ["type","category","item category","item type","product category","subcategory","product type"],
    gender: ["gender","department","size gender","category gender"],
    color: ["color","colour","primary color"],
    price: ["price","sale price","sold price","net sale price","item price","amount","total earnings","payout","order total","earnings","subtotal"],
    shipTo: ["ship to","shipping state","buyer state","state","shipping address state","country","buyer country","destination","buyer location"],
    listed: ["date listed","listed date","listing date","created date","list date"],
    sold: ["date sold","sold date","order date","purchase date","sale date","completed date"],
    sample: ["sample"]
  };

  var state = {
    data: [],
    filters: {platforms:new Set(), brands:new Set(), genders:new Set(), types:new Set(), colors:new Set(), shipTos:new Set(), daysMin:null, daysMax:null, search:""},
    groupBy: "gender-brand-type",
    sort: {key:"sold", dir:"desc"},
    includeSample: true,
    previewPlatform: "Poshmark",
    loadErrors: []
  };

  function $(sel, root){ return (root||document).querySelector(sel); }
  function el(tag, attrs, children){
    var e = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function(k){
      if (k === "class") e.className = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else if (k.indexOf("on") === 0 && typeof attrs[k] === "function") e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (children||[]).forEach(function(c){ if (c) e.appendChild(c); });
    return e;
  }
  function fmtMoney(n){ return "$" + n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function daysBetween(a,b){
    var da = new Date(a), db = new Date(b);
    if (isNaN(da) || isNaN(db)) return null;
    return Math.max(0, Math.round((db - da) / 86400000));
  }
  function showToast(msg){
    var t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(showToast._h);
    showToast._h = setTimeout(function(){ t.classList.remove("show"); }, 2600);
  }

  /* ---------- CSV parsing + column auto-mapping ---------- */
  function parseCSV(text){
    var rows = [], row = [], field = "", inQuotes = false;
    for (var i=0;i<text.length;i++){
      var c = text[i];
      if (inQuotes){
        if (c === '"'){
          if (text[i+1] === '"'){ field += '"'; i++; } else { inQuotes = false; }
        } else field += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ",") { row.push(field); field = ""; }
        else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else if (c === "\r") { /* skip */ }
        else field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function(r){ return r.length > 1 || (r[0]||"").trim() !== ""; });
  }

  function guessColumn(headers, field){
    var aliases = FIELD_ALIASES[field];
    var lower = headers.map(function(h){ return h.trim().toLowerCase(); });
    for (var i=0;i<aliases.length;i++){
      var idx = lower.indexOf(aliases[i]);
      if (idx !== -1) return idx;
    }
    for (var j=0;j<lower.length;j++){
      for (var k=0;k<aliases.length;k++){
        if (lower[j].indexOf(aliases[k]) !== -1) return j;
      }
    }
    return -1;
  }

  function normalizeDate(raw){
    if (!raw) return "";
    var d = new Date(raw);
    if (isNaN(d)) return raw;
    return d.toISOString().slice(0,10);
  }

  function rowsFromCSV(text, platform){
    var table = parseCSV(text);
    if (table.length < 2) return [];
    var headers = table[0];
    var dataRows = table.slice(1);
    var mapping = {};
    Object.keys(FIELD_ALIASES).forEach(function(field){ mapping[field] = guessColumn(headers, field); });

    return dataRows.map(function(row){
      var rec = {platform: platform};
      Object.keys(mapping).forEach(function(field){
        var idx = mapping[field];
        var raw = idx === -1 ? "" : (row[idx] || "").trim();
        if (field === "price") rec.price = Number(raw.replace(/[^0-9.\-]/g,"")) || 0;
        else if (field === "listed") rec.listed = normalizeDate(raw);
        else if (field === "sold") rec.sold = normalizeDate(raw);
        else if (field === "sample") rec.isSample = /^(yes|true|1|y)$/i.test(raw);
        else rec[field] = raw || "Unknown";
      });
      if (!rec.brand) rec.brand = "Unknown";
      if (!rec.type) rec.type = "Unknown";
      return rec;
    });
  }

  /* ---------- loading ---------- */
  function loadAll(){
    var fetches = PLATFORM_FILES.map(function(pf){
      return fetch(pf.file, {cache:"no-store"}).then(function(res){
        if (!res.ok) throw new Error(pf.file + " (" + res.status + ")");
        return res.text();
      }).then(function(text){
        return rowsFromCSV(text, pf.platform);
      }).catch(function(err){
        state.loadErrors.push(err.message || String(err));
        return [];
      });
    });
    return Promise.all(fetches).then(function(results){
      state.data = results.reduce(function(a,b){ return a.concat(b); }, []);
      renderErrorBanner();
      renderAll();
    });
  }

  function renderErrorBanner(){
    var banner = $("#error-banner");
    if (!state.loadErrors.length){ banner.hidden = true; return; }
    banner.hidden = false;
    banner.innerHTML = "";
    banner.appendChild(el("span",{class:"tag",text:"Couldn't load"}));
    banner.appendChild(document.createTextNode(
      "Missing or unreachable: " + state.loadErrors.join(", ") +
      ". If you're opening index.html directly from disk, run a local server instead (see README) — browsers block file:// fetches."
    ));
  }

  /* ---------- derived data ---------- */
  function hasRealData(){ return state.data.some(function(r){ return !r.isSample; }); }
  function activeRows(){
    var rows = state.data;
    if (!state.includeSample) rows = rows.filter(function(r){ return !r.isSample; });
    return rows;
  }
  function uniqueValues(key){
    var s = new Set();
    activeRows().forEach(function(r){ if (r[key]) s.add(r[key]); });
    return Array.from(s).sort();
  }
  function filteredRows(){
    var f = state.filters;
    var rows = activeRows().map(function(r){
      return Object.assign({}, r, {_days: daysBetween(r.listed, r.sold)});
    });
    return rows.filter(function(r){
      if (f.platforms.size && !f.platforms.has(r.platform)) return false;
      if (f.brands.size && !f.brands.has(r.brand)) return false;
      if (f.genders.size && !f.genders.has(r.gender)) return false;
      if (f.types.size && !f.types.has(r.type)) return false;
      if (f.colors.size && !f.colors.has(r.color)) return false;
      if (f.shipTos.size && !f.shipTos.has(r.shipTo)) return false;
      if (f.daysMin != null && (r._days == null || r._days < f.daysMin)) return false;
      if (f.daysMax != null && (r._days == null || r._days > f.daysMax)) return false;
      if (f.search) {
        var hay = [r.brand,r.type,r.color,r.platform,r.shipTo].join(" ").toLowerCase();
        if (hay.indexOf(f.search.toLowerCase()) === -1) return false;
      }
      return true;
    });
  }

  /* ---------- KPIs ---------- */
  function renderKpis(){
    var rows = filteredRows();
    var revenue = rows.reduce(function(s,r){ return s + (Number(r.price)||0); }, 0);
    var count = rows.length;
    var avgPrice = count ? revenue / count : 0;
    var daysRows = rows.filter(function(r){ return r._days != null; });
    var avgDays = daysRows.length ? daysRows.reduce(function(s,r){ return s + r._days; },0) / daysRows.length : null;

    var wrap = $("#kpi-row");
    wrap.innerHTML = "";
    [
      {label:"Revenue", value: fmtMoney(revenue)},
      {label:"Items sold", value: String(count)},
      {label:"Avg. sale price", value: count ? fmtMoney(avgPrice) : "—"},
      {label:"Avg. days listed", value: avgDays != null ? avgDays.toFixed(1) : "—"}
    ].forEach(function(c){
      wrap.appendChild(el("div",{class:"kpi"},[
        el("div",{class:"label",text:c.label}),
        el("div",{class:"value num",text:c.value})
      ]));
    });
  }

  /* ---------- sidebar filters ---------- */
  function chipGroup(title, values, setRef){
    var group = el("div",{class:"filter-group"});
    group.appendChild(el("h3",{text:title}));
    var list = el("div",{class:"chiplist"});
    if (!values.length) list.appendChild(el("span",{class:"range-hint",text:"No data yet"}));
    values.forEach(function(v){
      var active = setRef.has(v);
      var chip = el("button",{class:"chip"+(active?" active":""), type:"button", "aria-pressed": active?"true":"false"},[document.createTextNode(v)]);
      chip.addEventListener("click", function(){
        if (setRef.has(v)) setRef.delete(v); else setRef.add(v);
        renderAll();
      });
      list.appendChild(chip);
    });
    group.appendChild(list);
    return group;
  }

  function renderSidebar(){
    var side = $("#sidebar");
    side.innerHTML = "";
    var platformsPresent = PLATFORM_FILES.map(function(p){return p.platform;}).filter(function(p){ return activeRows().some(function(r){return r.platform===p;}); });
    side.appendChild(chipGroup("Platform", platformsPresent, state.filters.platforms));
    side.appendChild(chipGroup("Gender", uniqueValues("gender"), state.filters.genders));
    side.appendChild(chipGroup("Brand", uniqueValues("brand"), state.filters.brands));
    side.appendChild(chipGroup("Type", uniqueValues("type"), state.filters.types));
    side.appendChild(chipGroup("Color", uniqueValues("color"), state.filters.colors));
    side.appendChild(chipGroup("Ship to", uniqueValues("shipTo"), state.filters.shipTos));

    var daysGroup = el("div",{class:"filter-group"});
    daysGroup.appendChild(el("h3",{text:"Days listed"}));
    var row = el("div",{class:"range-row"});
    var minInput = el("input",{type:"number", min:"0", placeholder:"Min"});
    var maxInput = el("input",{type:"number", min:"0", placeholder:"Max"});
    minInput.value = state.filters.daysMin != null ? state.filters.daysMin : "";
    maxInput.value = state.filters.daysMax != null ? state.filters.daysMax : "";
    minInput.addEventListener("input", function(){ state.filters.daysMin = this.value === "" ? null : Number(this.value); renderAll(); });
    maxInput.addEventListener("input", function(){ state.filters.daysMax = this.value === "" ? null : Number(this.value); renderAll(); });
    row.appendChild(minInput); row.appendChild(document.createTextNode("–")); row.appendChild(maxInput);
    daysGroup.appendChild(row);
    daysGroup.appendChild(el("div",{class:"range-hint",text:"Days between listing and sale"}));
    side.appendChild(daysGroup);

    if (hasRealData()) {
      var sampleGroup = el("div",{class:"filter-group"});
      var lbl = el("label",{});
      lbl.style.cssText = "display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;";
      var cb = el("input",{type:"checkbox"});
      cb.checked = state.includeSample;
      cb.addEventListener("change", function(){ state.includeSample = this.checked; renderAll(); });
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode("Include sample rows"));
      sampleGroup.appendChild(lbl);
      side.appendChild(sampleGroup);
    }
  }

  /* ---------- breakdown table ---------- */
  var GROUP_DEFS = {
    brand: {cols:["Brand"], keyFn:function(r){ return [r.brand]; }},
    gender: {cols:["Gender"], keyFn:function(r){ return [r.gender]; }},
    type: {cols:["Type"], keyFn:function(r){ return [r.type]; }},
    color: {cols:["Color"], keyFn:function(r){ return [r.color]; }},
    platform: {cols:["Platform"], keyFn:function(r){ return [r.platform]; }},
    shipTo: {cols:["Ship to"], keyFn:function(r){ return [r.shipTo]; }},
    "gender-brand-type": {cols:["Gender","Brand","Type"], keyFn:function(r){ return [r.gender, r.brand, r.type]; }}
  };

  function renderBreakdown(){
    var rows = filteredRows();
    var host = $("#breakdown-table");
    var mode = state.groupBy;
    if (mode === "none" || !rows.length) {
      host.innerHTML = "";
      if (!rows.length) host.appendChild(el("div",{class:"empty",text:"No sales match the current filters."}));
      return;
    }
    var def = GROUP_DEFS[mode];
    var groups = {};
    rows.forEach(function(r){
      var keyParts = def.keyFn(r);
      var key = keyParts.join(" • ");
      if (!groups[key]) groups[key] = {parts:keyParts, count:0, revenue:0, days:[]};
      groups[key].count += 1;
      groups[key].revenue += Number(r.price)||0;
      if (r._days != null) groups[key].days.push(r._days);
    });
    var list = Object.keys(groups).map(function(k){ return groups[k]; });
    list.sort(function(a,b){
      for (var i=0;i<a.parts.length;i++){
        if (a.parts[i] !== b.parts[i]) return (a.parts[i]||"").localeCompare(b.parts[i]||"");
      }
      return 0;
    });
    var maxRevenue = Math.max.apply(null, list.map(function(g){return g.revenue;}).concat([1]));

    var table = el("table");
    var thead = el("thead");
    var headRow = el("tr");
    def.cols.forEach(function(c){ headRow.appendChild(el("th",{text:c})); });
    ["Sales","Revenue","Avg price","Avg days","Share"].forEach(function(c){ headRow.appendChild(el("th",{class:"num",text:c})); });
    thead.appendChild(headRow);
    table.appendChild(thead);
    var tbody = el("tbody");
    list.forEach(function(g){
      var tr = el("tr");
      g.parts.forEach(function(p){ tr.appendChild(el("td",{text:p||"—"})); });
      tr.appendChild(el("td",{class:"num", text:String(g.count)}));
      tr.appendChild(el("td",{class:"num", text:fmtMoney(g.revenue)}));
      tr.appendChild(el("td",{class:"num", text:fmtMoney(g.revenue/g.count)}));
      var avgD = g.days.length ? (g.days.reduce(function(s,d){return s+d;},0)/g.days.length).toFixed(1) : "—";
      tr.appendChild(el("td",{class:"num", text:avgD}));
      var shareCell = el("td");
      var barCell = el("div",{class:"bar-cell"});
      var track = el("div",{class:"bar-track"});
      var fill = el("div",{class:"bar-fill"});
      fill.style.width = Math.round((g.revenue/maxRevenue)*100) + "%";
      track.appendChild(fill);
      barCell.appendChild(track);
      barCell.appendChild(el("span",{class:"num", text: Math.round((g.revenue/maxRevenue)*100)+"%"}));
      shareCell.appendChild(barCell);
      tr.appendChild(shareCell);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    host.innerHTML = "";
    host.appendChild(table);
  }

  /* ---------- sales table ---------- */
  var SALES_COLS = [
    {key:"platform", label:"Platform"},
    {key:"brand", label:"Brand"},
    {key:"type", label:"Type"},
    {key:"gender", label:"Gender"},
    {key:"color", label:"Color"},
    {key:"price", label:"Price", num:true},
    {key:"shipTo", label:"Ship to"},
    {key:"listed", label:"Listed"},
    {key:"sold", label:"Sold"},
    {key:"_days", label:"Days", num:true}
  ];

  function renderSalesTable(){
    var rows = filteredRows();
    $("#result-count").textContent = rows.length + " of " + activeRows().length + " sales";

    var sk = state.sort.key, sd = state.sort.dir;
    rows = rows.slice().sort(function(a,b){
      var av = a[sk], bv = b[sk];
      if (av == null) av = "";
      if (bv == null) bv = "";
      if (typeof av === "number" || typeof bv === "number") return sd === "asc" ? av-bv : bv-av;
      return sd === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });

    var host = $("#sales-table");
    host.innerHTML = "";
    if (!rows.length) { host.appendChild(el("div",{class:"empty",text:"No sales match the current filters."})); return; }

    var table = el("table");
    var thead = el("thead");
    var headRow = el("tr");
    SALES_COLS.forEach(function(c){
      var th = el("th",{class:c.num?"num":""});
      th.textContent = c.label;
      if (sk === c.key) th.appendChild(el("span",{class:"arrow", text: sd === "asc" ? "↑" : "↓"}));
      th.addEventListener("click", function(){
        if (state.sort.key === c.key) state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
        else { state.sort.key = c.key; state.sort.dir = c.num ? "desc" : "asc"; }
        renderSalesTable();
      });
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = el("tbody");
    rows.forEach(function(r){
      var tr = el("tr");
      var platformCell = el("td");
      if (r.isSample) platformCell.appendChild(el("span",{class:"sample-dot", title:"Sample row"}));
      platformCell.appendChild(el("span",{class:"platform-tag",text:r.platform}));
      tr.appendChild(platformCell);
      tr.appendChild(el("td",{text:r.brand}));
      tr.appendChild(el("td",{text:r.type}));
      tr.appendChild(el("td",{text:r.gender||"—"}));
      tr.appendChild(el("td",{text:r.color||"—"}));
      tr.appendChild(el("td",{class:"num",text:fmtMoney(Number(r.price)||0)}));
      tr.appendChild(el("td",{text:r.shipTo||"—"}));
      tr.appendChild(el("td",{class:"num",text:r.listed||"—"}));
      tr.appendChild(el("td",{class:"num",text:r.sold||"—"}));
      tr.appendChild(el("td",{class:"num",text: r._days != null ? String(r._days) : "—"}));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    host.appendChild(table);
  }

  function renderAll(){
    renderKpis();
    renderSidebar();
    renderBreakdown();
    renderSalesTable();
    $("#sample-banner").hidden = !state.data.some(function(r){ return r.isSample; }) || (hasRealData() && !state.includeSample);
  }

  /* ---------- local preview loader (this browser tab only) ---------- */
  function renderPreviewTabs(){
    var host = $("#preview-platform-tabs");
    host.innerHTML = "";
    PLATFORM_FILES.forEach(function(pf){
      var btn = el("button",{class:"tab-btn"+(state.previewPlatform===pf.platform?" active":""), type:"button", text:pf.platform});
      btn.addEventListener("click", function(){ state.previewPlatform = pf.platform; renderPreviewTabs(); });
      host.appendChild(btn);
    });
  }

  function handlePreviewLoad(){
    var input = $("#preview-file-input");
    var file = input.files && input.files[0];
    if (!file) { showToast("Choose a CSV file first"); return; }
    var reader = new FileReader();
    reader.onload = function(){
      var rows = rowsFromCSV(String(reader.result), state.previewPlatform);
      if (!rows.length) { showToast("Couldn't find any data rows in that file"); return; }
      state.data = state.data.concat(rows);
      state.includeSample = false;
      renderAll();
      $("#howto-modal").hidden = true;
      showToast("Previewing " + rows.length + " extra " + state.previewPlatform + " rows (this tab only)");
    };
    reader.onerror = function(){ showToast("Couldn't read that file"); };
    reader.readAsText(file);
  }

  /* ---------- wire up ---------- */
  document.addEventListener("DOMContentLoaded", function(){
    $("#btn-howto").addEventListener("click", function(){ $("#howto-modal").hidden = false; renderPreviewTabs(); });
    $("#btn-close-howto").addEventListener("click", function(){ $("#howto-modal").hidden = true; });
    $("#howto-modal").addEventListener("click", function(e){ if (e.target === this) this.hidden = true; });
    $("#btn-preview-load").addEventListener("click", handlePreviewLoad);
    $("#groupby-select").value = state.groupBy;
    $("#groupby-select").addEventListener("change", function(){ state.groupBy = this.value; renderBreakdown(); });
    $("#search-box").addEventListener("input", function(){ state.filters.search = this.value; renderAll(); });
    $("#btn-reset").addEventListener("click", function(){
      state.filters = {platforms:new Set(), brands:new Set(), genders:new Set(), types:new Set(), colors:new Set(), shipTos:new Set(), daysMin:null, daysMax:null, search:""};
      $("#search-box").value = "";
      renderAll();
    });
    loadAll();
  });
})();
