/*
 * E-Ladesäulen Karte – Deutschland
 * Datenquelle: Bundesnetzagentur via Open Data Rhein-Kreis-Neuss
 * Dataset: rhein-kreis-neuss-ladesaulen-in-deutschland (61.793 Einträge)
 *
 * ConfigData:
 *   {
 *     "apiurl": "https://opendata.rhein-kreis-neuss.de/api/explore/v2.1/catalog/datasets/rhein-kreis-neuss-ladesaulen-in-deutschland/records"
 *   }
 *   oder
 *   {
 *     "apiurl": "https://<portal>/api/3/action/datastore_search?resource_id=<resource-id>"
 *   }
 *
 * @param {Object} configdata
 * @param enclosingHtmlDivElement
 * @returns NULL
 */
function app(configdata = {}, enclosingHtmlDivElement) {
  const BASE_URL = configdata.apiurl;

  enclosingHtmlDivElement.innerHTML = `
    <div class="card mb-3 border-0 shadow-sm">
      <div class="card-body py-3">
        <div class="text-end mb-1"><small id="ls-datenstand" class="text-muted"></small></div>
        <div class="row g-2 align-items-start">
          <div class="col-12 col-md-7">
            <label class="form-label fw-semibold mb-1">🔍 Stadt oder PLZ</label>
            <div class="input-group has-validation">
              <input type="text" id="ort-input" class="form-control"
                placeholder="z. B. Frankfurt oder 60311"
                autocomplete="off" />
              <button class="btn btn-success" id="suche-btn">Suchen</button>
              <div class="invalid-feedback">Bitte Stadt oder PLZ eingeben.</div>
            </div>
          </div>
          <div class="col-12 col-md-5">
            <label class="form-label fw-semibold mb-1">🔌 Steckertyp</label>
            <div class="d-flex gap-2 align-items-center">
              <select id="filter-stecker" class="form-select">
                <option value="">Alle</option>
                <option value="CCS">CCS (DC Combo)</option>
                <option value="CHAdeMO">CHAdeMO</option>
                <option value="AC Typ 2">AC Typ 2</option>
                <option value="AC Schuko">AC Schuko</option>
              </select>
              <div id="treffer-badge" class="text-nowrap"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div id="ladestation-map" style="height: 500px; border-radius: 10px; overflow: hidden; z-index:0; position:relative;">
      <button id="fullscreen-btn" title="Vollbild"
        style="position:absolute;top:10px;right:10px;z-index:1000;
               background:#fff;border:2px solid rgba(0,0,0,.3);border-radius:6px;
               width:34px;height:34px;cursor:pointer;font-size:16px;line-height:1;
               display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.3);">
        ⛶
      </button>
    </div>

    <div id="ladestation-list" class="mt-4">
      <div class="text-center py-5 text-muted">
        <div style="font-size:2.5rem;">⚡</div>
        <p class="mt-2">Gib eine Stadt oder PLZ ein und klicke auf <strong>Suchen</strong>.</p>
      </div>
    </div>
  `;

  loadLeaflet().then(() => initMap(enclosingHtmlDivElement, BASE_URL, configdata));
  return null;
}

/* ── Leaflet dynamisch laden ── */
function loadLeaflet() {
  return new Promise((resolve) => {
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    if (!document.getElementById("leaflet-cluster-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-cluster-css";
      link.rel = "stylesheet";
      link.href =
        "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css";
      document.head.appendChild(link);
      const link2 = document.createElement("link");
      link2.id = "leaflet-cluster-default-css";
      link2.rel = "stylesheet";
      link2.href =
        "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css";
      document.head.appendChild(link2);
    }
    function loadScript(src, id) {
      return new Promise((res) => {
        if (document.getElementById(id)) {
          res();
          return;
        }
        const s = document.createElement("script");
        s.id = id;
        s.src = src;
        s.onload = res;
        document.head.appendChild(s);
      });
    }
    const leafletReady =
      typeof L !== "undefined"
        ? Promise.resolve()
        : loadScript(
            "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
            "leaflet-js",
          );
    leafletReady
      .then(() =>
        loadScript(
          "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js",
          "leaflet-cluster-js",
        ),
      )
      .then(resolve)
      .catch(() => console.error("Leaflet konnte nicht geladen werden."));
  });
}

/* ── Karte und Logik initialisieren ── */
function initMap(el, BASE_URL, configdata) {
  const map = L.map("ladestation-map").setView([51.165, 10.451], 6);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | Daten: Bundesnetzagentur (CC BY 4.0)',
    maxZoom: 19,
  }).addTo(map);

  const markerGroup = L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    iconCreateFunction(cluster) {
      const count = cluster.getChildCount();
      const size = count < 10 ? 34 : count < 100 ? 40 : 48;
      const bg = count < 10 ? "#198754" : count < 100 ? "#0d6efd" : "#dc3545";
      return L.divIcon({
        className: "",
        html: `<div style="background:${bg};color:#fff;border-radius:50%;width:${size}px;height:${size}px;
          display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;
          box-shadow:0 2px 8px rgba(0,0,0,.35);border:2px solid #fff;">${count}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
    },
  }).addTo(map);
  let alleStationen = [];
  let alleStationenRaw = []; // ungefiltert, für clientseitigen Stecker-Filter
  let geladenerOrt = null; // Anzeigewert im Input (Ortsname)
  let geladenerSuchWert = null; // tatsächlich verwendeter API-Suchwert (PLZ oder Ort)
  let markers = [];
  const apiType = detectApiType(BASE_URL);

  function detectApiType(url) {
    const lower = String(url || "").toLowerCase();
    if (lower.includes("/api/3/action/")) return "ckan";
    return "ods-v2";
  }

  function escapeSqlString(value) {
    return String(value || "").replace(/'/g, "''");
  }

  function buildUrlWithParams(baseUrl, paramsToSet = {}) {
    const [base, query = ""] = String(baseUrl || "").split("?");
    const params = new URLSearchParams(query);
    Object.entries(paramsToSet).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }

  function getUrlOrigin(url) {
    const m = String(url || "").match(/^https?:\/\/[^/]+/i);
    return m ? m[0] : "";
  }

  function getCkanResourceId(url) {
    const [, query = ""] = String(url || "").split("?");
    const params = new URLSearchParams(query);
    return params.get("resource_id") || null;
  }

  function getCkanSqlEndpoint(url) {
    const base = String(url || "").split("?")[0];
    if (base.includes("/api/3/action/datastore_search_sql")) return base;
    if (base.includes("/api/3/action/datastore_search")) {
      return base.replace(
        "/api/3/action/datastore_search",
        "/api/3/action/datastore_search_sql",
      );
    }
    const origin = getUrlOrigin(url);
    return origin
      ? `${origin}/api/3/action/datastore_search_sql`
      : "/api/3/action/datastore_search_sql";
  }

  function getCkanSearchEndpoint(url) {
    const base = String(url || "").split("?")[0];
    if (base.includes("/api/3/action/datastore_search")) return base;
    if (base.includes("/api/3/action/datastore_search_sql")) {
      return base.replace(
        "/api/3/action/datastore_search_sql",
        "/api/3/action/datastore_search",
      );
    }
    const origin = getUrlOrigin(url);
    return origin
      ? `${origin}/api/3/action/datastore_search`
      : "/api/3/action/datastore_search";
  }

  /* ── Icons ── */
  function makeIcon(schnell) {
    const bg = schnell ? "#dc3545" : "#198754";
    const symbol = schnell ? "⚡⚡" : "⚡";
    return L.divIcon({
      className: "",
      html: `<div style="background:${bg};color:#fff;border-radius:50%;width:30px;height:30px;
        display:flex;align-items:center;justify-content:center;font-size:13px;
        box-shadow:0 2px 6px rgba(0,0,0,.4);border:2px solid #fff;">${symbol}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -32],
    });
  }

  /* ── Steckertypen aus einem Datensatz als Liste ── */
  function getStecker(s) {
    return [
      s.steckertypen1,
      s.steckertypen2,
      s.steckertypen3,
      s.steckertypen4,
      s.steckertypen5,
      s.steckertypen6,
    ]
      .filter(Boolean)
      .map((t) => `<span class="badge bg-secondary me-1">${t}</span>`)
      .join("");
  }

  function getSteckerText(s) {
    return [
      s.steckertypen1,
      s.steckertypen2,
      s.steckertypen3,
      s.steckertypen4,
      s.steckertypen5,
      s.steckertypen6,
    ]
      .filter(Boolean)
      .join(", ");
  }

  function getKw(s) {
    const kws = [s.p1_kw, s.p2_kw, s.p3_kw, s.p4_kw, s.p5_kw, s.p6_kw].filter(
      (v) => v !== null && v !== undefined && v > 0,
    );
    if (kws.length === 0)
      return s.nennleistung_ladeeinrichtung_kw
        ? `${s.nennleistung_ladeeinrichtung_kw} kW`
        : "–";
    const max = Math.max(...kws);
    return `${s.nennleistung_ladeeinrichtung_kw ?? max} kW (max. ${max} kW/Punkt)`;
  }

  function istSchnell(s) {
    return (s.art_der_ladeeinrichtung || "").toLowerCase().includes("schnell");
  }

  /* ── Koordinaten normalisieren und auf Deutschland-Bounding-Box prüfen ── */
  function getCoord(source) {
    const rec = source && typeof source === "object" ? source : null;
    let coord = rec && "koordinaten" in rec ? rec.koordinaten : source;
    let lat = null;
    let lon = null;

    const toNum = (v) => {
      if (v === null || v === undefined) return null;
      const n = Number(String(v).replace(",", "."));
      return Number.isFinite(n) ? n : null;
    };

    if (typeof coord === "string") {
      const trimmed = coord.trim();
      if (trimmed.startsWith("{")) {
        try {
          coord = JSON.parse(trimmed);
        } catch {
          coord = null;
        }
      } else if (trimmed.includes(",")) {
        const parts = trimmed.split(",").map((p) => toNum(p.trim()));
        if (parts.length >= 2 && parts[0] !== null && parts[1] !== null) {
          lat = parts[0];
          lon = parts[1];
        }
      }
    }

    if (coord && typeof coord === "object") {
      lat =
        lat ??
        toNum(coord.lat ?? coord.latitude ?? coord.y ?? coord[1] ?? null);
      lon =
        lon ??
        toNum(
          coord.lon ??
            coord.lng ??
            coord.longitude ??
            coord.x ??
            coord[0] ??
            null,
        );
    }

    if (rec) {
      lat =
        lat ??
        toNum(
          rec.breitengrad ?? rec.latitude ?? rec.lat ?? rec.y_koord ?? null,
        );
      lon =
        lon ??
        toNum(
          rec.laengengrad ??
            rec.längengrad ??
            rec.longitude ??
            rec.lon ??
            rec.lng ??
            rec.x_koord ??
            null,
        );
    }

    if (lat === null || lon === null) return null;
    // Vertauschte lat/lon erkennen und korrigieren
    if (lat >= 5.8 && lat <= 15.1 && lon >= 47.2 && lon <= 55.1) {
      [lat, lon] = [lon, lat];
    }
    // Nur Koordinaten innerhalb Deutschlands akzeptieren
    if (lat >= 47.2 && lat <= 55.1 && lon >= 5.8 && lon <= 15.1) {
      return { lat, lon };
    }
    return null;
  }

  /* ── Haversine-Distanz in km ── */
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /* ── Dynamischer Radius anhand Trefferzahl ── */
  function dynamicRadius(count) {
    if (count < 10) return 8; // Kleinstort
    if (count < 30) return 15; // Kleiner Ort
    if (count < 100) return 20; // Mittelstadt
    if (count < 500) return 25; // Großstadt (Stuttgart, Köln, …)
    return 30; // Metropole (Berlin, Hamburg)
  }

  /* ── Photon-Geocoding für eine Station ── */
  async function geocodeStation(s) {
    const teile = [
      [s.strasse, s.hausnummer].filter(Boolean).join(" "),
      s.postleitzahl,
      s.ort,
      "Deutschland",
    ].filter(Boolean);
    const q = encodeURIComponent(teile.join(", "));
    try {
      const res = await fetch(
        `https://photon.komoot.io/api/?q=${q}&limit=1&lang=de`,
      );
      if (!res.ok) return null;
      const data = await res.json();
      const f = data.features?.[0];
      if (!f) return null;
      const [lon, lat] = f.geometry.coordinates;
      return { lat, lon };
    } catch {
      return null;
    }
  }

  /* ── Geografische Ausreißer erkennen und per Geocoding korrigieren ── */
  async function fixOutliers(stationen) {
    const coords = stationen.map((s) => getCoord(s)).filter(Boolean);
    if (coords.length < 3) return stationen;

    const lats = coords.map((c) => c.lat).sort((a, b) => a - b);
    const lons = coords.map((c) => c.lon).sort((a, b) => a - b);
    const medLat = lats[Math.floor(lats.length / 2)];
    const medLon = lons[Math.floor(lons.length / 2)];
    const maxKm = dynamicRadius(stationen.length);

    const result = [];
    for (const s of stationen) {
      const c = getCoord(s);
      if (!c) continue;
      const dist = haversine(c.lat, c.lon, medLat, medLon);
      if (dist <= maxKm) {
        result.push(s);
      } else {
        // Ausreißer → Adresse geocoden
        const fixed = await geocodeStation(s);
        if (fixed && haversine(fixed.lat, fixed.lon, medLat, medLon) <= maxKm) {
          // Korrigierte Koordinaten in eine Kopie schreiben
          result.push({ ...s, koordinaten: fixed });
        }
        // sonst: Station weglassen
      }
    }
    return result;
  }

  /* ── Marker rendern ── */
  function renderMarkers(stationen) {
    markerGroup.clearLayers();
    markers = [];
    stationen.forEach((s, i) => {
      const coord = getCoord(s);
      if (!coord) return;
      const schnell = istSchnell(s);
      const marker = L.marker([coord.lat, coord.lon], {
        icon: makeIcon(schnell),
      });

      const adresse = [s.strasse, s.hausnummer].filter(Boolean).join(" ");
      const ort = [s.postleitzahl, s.ort].filter(Boolean).join(" ");
      const inbetrieb = s.inbetriebnahmedatum
        ? new Date(s.inbetriebnahmedatum).toLocaleDateString("de-DE")
        : "–";

      marker.bindPopup(
        `
        <div style="min-width:220px">
          <div class="fw-bold mb-1">${s.betreiber || "Unbekannter Betreiber"}</div>
          <div class="text-muted small mb-2">${adresse}<br>${ort}</div>
          <table class="table table-sm table-borderless mb-1" style="font-size:.85rem">
            <tr><td class="text-muted pe-2">Typ</td>
                <td>${
                  schnell
                    ? '<span class="badge bg-danger">Schnelllader ⚡⚡</span>'
                    : '<span class="badge bg-success">Normallader ⚡</span>'
                }</td></tr>
            <tr><td class="text-muted pe-2">Ladepunkte</td>
                <td><strong>${s.anzahl_ladepunkte ?? "–"}</strong></td></tr>
            <tr><td class="text-muted pe-2">Leistung</td>
                <td>${getKw(s)}</td></tr>
            <tr><td class="text-muted pe-2">Stecker</td>
                <td>${getStecker(s) || "–"}</td></tr>
            <tr><td class="text-muted pe-2">In Betrieb</td>
                <td>${inbetrieb}</td></tr>
          </table>
          ${s.anzeigename_karte ? `<div class="text-muted small mb-2">${s.anzeigename_karte}</div>` : ""}
          <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([[s.strasse, s.hausnummer].filter(Boolean).join(" "), s.postleitzahl, s.ort, "Deutschland"].filter(Boolean).join(", "))}"
             target="_blank" rel="noopener noreferrer"
             class="btn btn-sm btn-outline-primary w-100 mt-1"
             style="font-size:.8rem;">
            In Google Maps öffnen
          </a>
        </div>
      `,
        { maxWidth: 300 },
      );

      markerGroup.addLayer(marker);
      markers.push({ marker, station: s, idx: i });
    });

    if (stationen.length > 0) {
      const coords = stationen
        .map((s) => getCoord(s))
        .filter(Boolean)
        .map((c) => [c.lat, c.lon]);
      if (coords.length > 0)
        map.fitBounds(L.latLngBounds(coords), { padding: [30, 30] });
    }
  }

  /* ── Tabelle rendern ── */
  function renderListe(stationen) {
    const listEl = el.querySelector("#ladestation-list");
    if (stationen.length === 0) {
      listEl.innerHTML = `<div class="alert alert-warning">Keine Ladestationen gefunden.</div>`;
      return;
    }

    // Statistik
    const gesamtPunkte = stationen.reduce(
      (a, s) => a + (s.anzahl_ladepunkte || 0),
      0,
    );
    const maxKw = Math.max(
      ...stationen
        .map((s) => s.nennleistung_ladeeinrichtung_kw || 0)
        .filter((v) => v > 0),
    );

    // Sortier-Zustand
    let sortKey = "leistung";
    let sortDir = -1;

    const cols = {
      betreiber: {
        label: "Betreiber",
        fn: (s) => (s.betreiber || "").toLowerCase(),
      },
      adresse: { label: "Adresse", fn: (s) => (s.strasse || "").toLowerCase() },
      typ: { label: "Typ", fn: (s) => (istSchnell(s) ? 1 : 0) },
      punkte: { label: "Punkte", fn: (s) => s.anzahl_ladepunkte || 0 },
      leistung: {
        label: "Leistung",
        fn: (s) => s.nennleistung_ladeeinrichtung_kw || 0,
      },
      stecker: { label: "Stecker", fn: (s) => getSteckerText(s).toLowerCase() },
    };

    function sortIcon(key) {
      if (sortKey !== key)
        return `<span class="text-muted ms-1" style="font-size:.7rem;opacity:.5;">↕</span>`;
      return sortDir === 1
        ? `<span class="ms-1" style="font-size:.75rem;">↑</span>`
        : `<span class="ms-1" style="font-size:.75rem;">↓</span>`;
    }

    function headerHtml() {
      return Object.entries(cols)
        .map(
          ([key, col]) =>
            `<th data-col="${key}" class="user-select-none" style="cursor:pointer;white-space:nowrap;">${col.label}${sortIcon(key)}</th>`,
        )
        .join("");
    }

    function getSorted() {
      const indexed = stationen.map((s, i) => ({ s, i }));
      if (!sortKey) return indexed;
      const fn = cols[sortKey].fn;
      return indexed.sort((a, b) => {
        const av = fn(a.s),
          bv = fn(b.s);
        if (av < bv) return -sortDir;
        if (av > bv) return sortDir;
        return 0;
      });
    }

    function renderTbody() {
      const sorted = getSorted();
      tbody.innerHTML = sorted
        .map(({ s, i }) => {
          const schnell = istSchnell(s);
          const adresse = [s.strasse, s.hausnummer].filter(Boolean).join(" ");
          const ort = [s.postleitzahl, s.ort].filter(Boolean).join(" ");
          const c = getCoord(s);
          const hasCoord = !!c;
          return `<tr style="cursor:${hasCoord ? "pointer" : "default"}"
                    data-lat="${c?.lat || ""}"
                    data-lon="${c?.lon || ""}"
                    data-idx="${i}">
                  <td class="fw-semibold" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                      title="${s.betreiber || ""}">${s.betreiber || "–"}</td>
                  <td>
                    <div style="font-size:.85rem">${adresse}</div>
                    <div class="text-muted" style="font-size:.75rem">${ort}</div>
                  </td>
                  <td style="white-space:nowrap">${
                    schnell
                      ? '<span class="badge bg-danger">Schnell ⚡⚡</span>'
                      : '<span class="badge bg-success">Normal ⚡</span>'
                  }</td>
                  <td class="text-center">${s.anzahl_ladepunkte ?? "–"}</td>
                  <td style="white-space:nowrap">${s.nennleistung_ladeeinrichtung_kw ? s.nennleistung_ladeeinrichtung_kw + " kW" : "–"}</td>
                  <td style="font-size:.78rem">${getSteckerText(s) || "–"}</td>
                </tr>`;
        })
        .join("");

      // Klick auf Zeile → Karte zentrieren & Popup öffnen
      tbody.querySelectorAll("tr").forEach((row) => {
        row.addEventListener("click", () => {
          const lat = parseFloat(row.dataset.lat);
          const lon = parseFloat(row.dataset.lon);
          const idx = parseInt(row.dataset.idx);
          if (!lat || !lon) return;
          map.setView([lat, lon], 17);
          markers[idx]?.marker.openPopup();
          document
            .getElementById("ladestation-map")
            .scrollIntoView({ behavior: "smooth", block: "center" });
        });
      });
    }

    listEl.innerHTML = `
      <div class="row g-3 mb-4">
        <div class="col-12 col-md-4">
          <div class="card text-center border-0 bg-success bg-opacity-10">
            <div class="card-body py-2">
              <div class="fs-4 fw-bold text-success">${stationen.length}</div>
              <div class="small text-muted">Ladesäulen</div>\n              ${kpiContext(configdata.kpiKontext1, "1")}
            </div>
          </div>
        </div>
        <div class="col-12 col-md-4">
          <div class="card text-center border-0 bg-primary bg-opacity-10">
            <div class="card-body py-2">
              <div class="fs-4 fw-bold text-primary">${gesamtPunkte}</div>
              <div class="small text-muted">Ladepunkte gesamt</div>\n              ${kpiContext(configdata.kpiKontext2, "2")}
            </div>
          </div>
        </div>
        <div class="col-12 col-md-4">
          <div class="card text-center border-0 bg-warning bg-opacity-10">
            <div class="card-body py-2">
              <div class="fs-4 fw-bold text-warning">${maxKw > 0 ? maxKw + " kW" : "–"}</div>
              <div class="small text-muted">Max. Leistung</div>\n              ${kpiContext(configdata.kpiKontext3, "3")}
            </div>
          </div>
        </div>
      </div>

      <h6 class="mb-2 fw-semibold">Alle Ladesäulen</h6>
      <div class="table-responsive w-100">
        <table class="table table-hover table-sm align-middle w-100">
          <colgroup>
            <col style="width:22%">
            <col style="width:22%">
            <col style="width:9%">
            <col style="width:7%">
            <col style="width:10%">
            <col style="width:30%">
          </colgroup>
          <thead class="table-dark">
            <tr id="sort-header">${headerHtml()}</tr>
          </thead>
          <tbody id="ladestation-tbody"></tbody>
        </table>
      </div>
      ${renderWeitereInfos(configdata)}${renderMethodikbox(configdata)}`;

    const tbody = listEl.querySelector("#ladestation-tbody");
    renderTbody();

    // Sortier-Klick auf Header
    listEl.querySelectorAll("th[data-col]").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.col;
        if (sortKey === key) {
          sortDir *= -1;
        } else {
          sortKey = key;
          sortDir = 1;
        }
        // Icons aktualisieren
        listEl.querySelectorAll("th[data-col]").forEach((h) => {
          h.innerHTML = cols[h.dataset.col].label + sortIcon(h.dataset.col);
        });
        renderTbody();
      });
    });
  }

  /* ── Treffer-Badge aktualisieren ── */
  function updateBadge(gefunden) {
    const badge = el.querySelector("#treffer-badge");
    if (!badge) return;
    if (gefunden === null) {
      badge.innerHTML = "";
    } else {
      badge.innerHTML = `
        <span class="badge bg-${gefunden > 0 ? "success" : "secondary"} fs-6">
          ${gefunden} Treffer
        </span>`;
    }
  }

  /* ── Stecker-Filter clientseitig anwenden ── */
  function applySteckerFilter(steckerFilter) {
    const filtered = steckerFilter
      ? alleStationenRaw.filter((s) =>
          [
            s.steckertypen1,
            s.steckertypen2,
            s.steckertypen3,
            s.steckertypen4,
            s.steckertypen5,
            s.steckertypen6,
          ].some((t) => t && t.includes(steckerFilter)),
        )
      : alleStationenRaw;
    alleStationen = filtered;
    updateBadge(alleStationen.length);
    renderMarkers(alleStationen);
    renderListe(alleStationen);
  }

  /* ── API-Abfrage – alle Seiten laden wenn > 100 Treffer ── */
  function fetchStationen(suchWert, displayWert) {
    // displayWert = was im Input steht (Ortsname); suchWert = was an die API geht (PLZ oder Ort)
    const ortDisplay = displayWert ?? suchWert;
    const listEl = el.querySelector("#ladestation-list");
    listEl.innerHTML = `
      <div class="text-center py-5 text-muted">
        <div class="spinner-border text-success mb-3" role="status"></div>
        <p>Lade Daten…</p>
      </div>`;
    markerGroup.clearLayers();
    markers = [];
    alleStationenRaw = [];
    geladenerOrt = null;
    updateBadge(null);

    // WHERE-Klausel — nur Ort/PLZ serverseitig filtern; Stecker wird clientseitig gefiltert
    const conditions = [];
    const suchText = (suchWert || "").trim();
    const istPlz = /^\d{4,5}$/.test(suchText);

    if (suchText) {
      if (istPlz) {
        conditions.push(`postleitzahl LIKE '${suchText}%'`);
      } else {
        conditions.push(`ort LIKE '%${suchText}%'`);
      }
    }

    const where = conditions.length > 0 ? conditions.join(" AND ") : null;

    async function fetchAllPagesOds() {
      var datasetId = BASE_URL.split("/catalog/datasets/")[1]?.split("/")[0] || "";
      if (datasetId) {
        var catUrl = BASE_URL.substring(0, BASE_URL.indexOf("/catalog/datasets/")) + "/catalog/datasets/" + datasetId;
        fetch(catUrl).then(function(r) { return r.json(); }).then(function(meta) {
          var stand = extractDatenStand(meta);
          if (stand) {
            var badge = document.getElementById("ls-datenstand");
            if (badge) badge.textContent = "Aktualisiert: " + stand;
          }
        }).catch(function() {});
      }

      const PAGE_SIZE = 100;
      let offset = 0;
      let total = null;
      let allResults = [];

      while (true) {
        const reqUrl = buildUrlWithParams(BASE_URL, {
          limit: PAGE_SIZE,
          offset,
          where,
        });

        const res = await fetch(reqUrl);
        if (!res.ok) throw new Error("API-Fehler: " + res.status);
        const data = await res.json();

        if (total === null) total = data.total_count || 0;
        const page = data.results || [];
        allResults = allResults.concat(page);

        // Ladefortschritt anzeigen
        if (total > PAGE_SIZE) {
          const p = listEl.querySelector("p");
          if (p) p.textContent = `Lade Daten… ${allResults.length} / ${total}`;
        }

        if (page.length < PAGE_SIZE || allResults.length >= total) break;
        offset += PAGE_SIZE;
      }
      return allResults;
    }

    async function fetchAllPagesCkan() {
      const PAGE_SIZE = 100;
      let offset = 0;
      let total = null;
      let allResults = [];
      const resourceId = getCkanResourceId(BASE_URL);

      while (true) {
        let reqUrl;
        if (resourceId) {
          const sqlWhere = !suchText
            ? ""
            : istPlz
              ? ` WHERE CAST(postleitzahl AS TEXT) LIKE '${escapeSqlString(suchText)}%'`
              : ` WHERE CAST(ort AS TEXT) ILIKE '%${escapeSqlString(suchText)}%'`;
          const sql = `SELECT * FROM "${resourceId}"${sqlWhere} LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
          reqUrl = buildUrlWithParams(getCkanSqlEndpoint(BASE_URL), { sql });
        } else {
          reqUrl = buildUrlWithParams(BASE_URL, {
            limit: PAGE_SIZE,
            offset,
            q: suchText || null,
          });
          if (!reqUrl.includes("/api/3/action/datastore_search")) {
            reqUrl = buildUrlWithParams(getCkanSearchEndpoint(BASE_URL), {
              limit: PAGE_SIZE,
              offset,
              q: suchText || null,
            });
          }
        }

        const res = await fetch(reqUrl);
        if (!res.ok) throw new Error("API-Fehler: " + res.status);
        const data = await res.json();
        if (data && data.success === false) {
          throw new Error(data.error?.message || "CKAN API-Fehler");
        }

        const page = data?.result?.records || [];
        if (total === null) total = data?.result?.total ?? 0;
        allResults = allResults.concat(page);

        if (total > PAGE_SIZE) {
          const p = listEl.querySelector("p");
          if (p) p.textContent = `Lade Daten… ${allResults.length} / ${total}`;
        }

        if (page.length < PAGE_SIZE || allResults.length >= total) break;
        offset += PAGE_SIZE;
      }
      return allResults;
    }

    async function fetchAllPages() {
      if (apiType === "ckan") return fetchAllPagesCkan();
      return fetchAllPagesOds();
    }

    fetchAllPages()
      .then(async (results) => {
        const valid = results.filter((s) => !!getCoord(s));

        // Ladetext während Geocoding aktualisieren
        const p = listEl.querySelector("p");
        if (p && valid.length > 0) p.textContent = "Prüfe Koordinaten…";

        alleStationenRaw = await fixOutliers(valid);
        geladenerOrt = ortDisplay;
        geladenerSuchWert = suchWert;
        applySteckerFilter(el.querySelector("#filter-stecker").value);
      })
      .catch((err) => {
        listEl.innerHTML = `
          <div class="alert alert-danger">
            <strong>Fehler beim Laden der Daten:</strong> ${err.message}
          </div>`;
        updateBadge(0);
      });
  }

  /* ── Event-Handler ── */
  const sucheBtn = el.querySelector("#suche-btn");
  const ortInput = el.querySelector("#ort-input");
  const filterStecker = el.querySelector("#filter-stecker");

  function triggerSuche() {
    const ort = ortInput.value.trim();
    if (!ort) {
      ortInput.classList.add("is-invalid");
      ortInput.focus();
      return;
    }
    ortInput.classList.remove("is-invalid");
    fetchStationen(ort, ort);
  }

  /* ── Vollbild-Toggle ── */
  const mapEl = el.querySelector("#ladestation-map");
  const fsBtn = el.querySelector("#fullscreen-btn");
  let isFullscreen = false;

  // Styles für Vollbild-Modus
  const fsStyle = [
    "position:fixed",
    "top:0",
    "left:0",
    "width:100vw",
    "height:100vh",
    "z-index:9999",
    "border-radius:0",
  ].join(";");
  const normalStyle =
    "height:500px;border-radius:10px;overflow:hidden;z-index:0;position:relative;";

  fsBtn.addEventListener("click", () => {
    isFullscreen = !isFullscreen;
    if (isFullscreen) {
      mapEl.style.cssText = fsStyle;
      fsBtn.textContent = "✕";
      fsBtn.title = "Vollbild beenden";
    } else {
      mapEl.style.cssText = normalStyle;
      fsBtn.textContent = "⛶";
      fsBtn.title = "Vollbild";
    }
    // Leaflet muss über die Größenveränderung informiert werden
    setTimeout(() => map.invalidateSize(), 50);
  });

  // Vollbild auch mit Escape beenden
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isFullscreen) fsBtn.click();
  });

  sucheBtn.addEventListener("click", triggerSuche);

  /* ── Autocomplete ── */
  // Suggestions-Liste direkt am body hängen, damit kein Eltern-Element sie wegclippt
  const suggestionsEl = document.createElement("ul");
  suggestionsEl.id = "ort-suggestions";
  suggestionsEl.className = "list-group shadow";
  suggestionsEl.style.cssText = [
    "display:none",
    "position:fixed",
    "z-index:99999",
    "max-height:220px",
    "overflow-y:auto",
    "border-radius:0 0 .375rem .375rem",
    "background:#fff",
    "margin:0",
    "padding:0",
  ].join(";");
  document.body.appendChild(suggestionsEl);

  function positionSuggestions() {
    const rect = ortInput.getBoundingClientRect();
    suggestionsEl.style.top = rect.bottom + window.scrollY + "px";
    suggestionsEl.style.left = rect.left + window.scrollX + "px";
    suggestionsEl.style.width = rect.width + "px";
  }

  let acIndex = -1;
  let acDebounce = null;

  function hideSuggestions() {
    suggestionsEl.style.display = "none";
    suggestionsEl.innerHTML = "";
    acIndex = -1;
  }

  function showSuggestions(features) {
    if (!features.length) {
      hideSuggestions();
      return;
    }
    acIndex = -1;
    suggestionsEl.innerHTML = features
      .map((f) => {
        const p = f.properties;
        const name = p.name || p.city || "";
        const plz = p.postcode || "";
        const parts = [plz, p.county || p.state, p.country].filter(Boolean);
        const detail = parts.join(" \u00b7 ");
        return `<li class="list-group-item list-group-item-action py-2 px-3"
                  data-value="${name.replace(/"/g, "&quot;")}"
                  data-plz="${plz}"
                  style="cursor:pointer;font-size:.9rem;">
                <span class="fw-semibold">${name}</span>${detail ? `<small class="text-muted ms-2">${detail}</small>` : ""}
              </li>`;
      })
      .join("");
    positionSuggestions();
    suggestionsEl.style.display = "block";

    suggestionsEl.querySelectorAll("li").forEach((li) => {
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        ortInput.value = li.dataset.value;
        const suchWert = li.dataset.plz || li.dataset.value;
        hideSuggestions();
        ortInput.classList.remove("is-invalid");
        fetchStationen(suchWert, li.dataset.value);
      });
    });
  }

  function highlightItem(newIdx, items) {
    items.forEach((li) => li.classList.remove("active"));
    if (newIdx >= 0 && newIdx < items.length) {
      items[newIdx].classList.add("active");
      ortInput.value = items[newIdx].dataset.value;
    }
    acIndex = newIdx;
  }

  ortInput.addEventListener("keydown", (e) => {
    const items = [...suggestionsEl.querySelectorAll("li")];
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightItem(Math.min(acIndex + 1, items.length - 1), items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightItem(Math.max(acIndex - 1, -1), items);
    } else if (e.key === "Escape") {
      hideSuggestions();
    } else if (e.key === "Enter") {
      if (acIndex >= 0 && items[acIndex]) {
        const li = items[acIndex];
        ortInput.value = li.dataset.value;
        const suchWert = li.dataset.plz || li.dataset.value;
        hideSuggestions();
        ortInput.classList.remove("is-invalid");
        fetchStationen(suchWert, li.dataset.value);
      } else {
        hideSuggestions();
        triggerSuche();
      }
    }
  });

  ortInput.addEventListener("input", () => {
    ortInput.classList.remove("is-invalid");
    clearTimeout(acDebounce);
    const q = ortInput.value.trim();
    if (q.length < 2) {
      hideSuggestions();
      return;
    }
    acDebounce = setTimeout(async () => {
      try {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=7&lang=de&bbox=5.86,47.27,15.04,55.06`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        const features = (data.features || []).filter((f) => {
          const p = f.properties;
          // Nur Orte/Städte/PLZ anzeigen, keine Straßen oder POIs
          return (
            p?.name &&
            (!p.osm_type ||
              p.type === "city" ||
              p.type === "town" ||
              p.type === "village" ||
              p.type === "hamlet" ||
              p.type === "suburb" ||
              p.type === "county" ||
              p.type === "state" ||
              p.type === "district" ||
              p.type === "postcode")
          );
        });
        showSuggestions(features.slice(0, 6));
      } catch {
        /* ignorieren */
      }
    }, 280);
  });

  // Neupositionieren bei Größenveränderung / Scrollen
  window.addEventListener("resize", () => {
    if (suggestionsEl.style.display !== "none") positionSuggestions();
  });
  window.addEventListener(
    "scroll",
    () => {
      if (suggestionsEl.style.display !== "none") positionSuggestions();
    },
    true,
  );

  ortInput.addEventListener("blur", () => setTimeout(hideSuggestions, 180));

  // Steckertyp → clientseitig filtern falls Daten für aktuellen Ort bereits geladen
  filterStecker.addEventListener("change", () => {
    const ort = ortInput.value.trim();
    if (alleStationenRaw.length > 0 && geladenerOrt === ort) {
      // Keine neue API-Anfrage nötig – clientseitig filtern
      applySteckerFilter(filterStecker.value);
    } else if (ort) {
      triggerSuche();
    }
  });
}

/*
 * addToHead – nicht benötigt, Leaflet wird dynamisch in loadLeaflet() geladen.
 */
function addToHead() {}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


  /* ── Schale 4: KPI Kontext ── */
  function kpiContext(kontext, id) {
    var text = String(kontext || "").trim();
    if (!text) return "";
    var targetId = "ls-kpi-kontext-" + id;
    return (
      '<button class="ls-kpi-info-toggle collapsed" type="button" ' +
      'data-bs-toggle="collapse" data-bs-target="#' + targetId + '" ' +
      'aria-expanded="false" aria-controls="' + targetId + '" ' +
      'aria-label="Erklärung zu diesem Wert">' +
      '<span class="ls-kpi-info-icon" aria-hidden="true">ⓘ</span>' +
      "</button>" +
      '<div id="' + targetId + '" class="collapse">' +
      '<div class="ls-kpi-kontext">' + escapeHtml(text) + "</div>" +
      "</div>"
    );
  }

  /* ── Schale 4: Methodikbox ── */
  function renderMethodikbox(cfg) {
    var hinweis = ((cfg && cfg.datenquelleHinweis) || "").trim();
    var stand = ((cfg && cfg.datenStand) || "").trim();
    if (!hinweis && !stand) return "";
    var standHtml = stand
      ? '<p class="text-muted small mb-2">' + escapeHtml(stand) + "</p>"
      : "";
    return (
      '<section class="ls-methodik mt-3">' +
      '<button class="ls-methodik-toggle collapsed" type="button" ' +
      'data-bs-toggle="collapse" data-bs-target="#ls-methodik-body" ' +
      'aria-expanded="false" aria-controls="ls-methodik-body">' +
      '<h2 class="h5 mb-0">Methodik &amp; Datenquelle</h2>' +
      '<span class="ls-methodik-chevron" aria-hidden="true">&#9662;</span>' +
      "</button>" +
      '<div id="ls-methodik-body" class="collapse">' +
      '<div class="ls-methodik-content">' +
      standHtml +
      hinweis +
      "</div></div></section>"
    );
  }

function renderWeitereInfos(cfg) {
  var links = ((cfg && cfg.weiterfuehrendeLinks) || "").trim();
  if (!links) return "";
  return (
    '<section class="ls-weitere-infos mt-3">' +
    '<h2 class="h5 mb-2">Weitere Informationen</h2>' +
    '<div class="ls-weitere-infos-content">' +
    links +
    "</div></section>"
  );
}

function extractDatenStand(responseData) {
  var modified = responseData?.metas?.modified || null;
  if (!modified) return null;
  var d = new Date(modified);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("de-DE");
}
