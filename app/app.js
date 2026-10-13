/*
 * E-Ladesäulen Karte – Deutschland
 * Datenquelle: Bundesnetzagentur via Open Data Rhein-Kreis-Neuss
 * Dataset: rhein-kreis-neuss-ladesaulen-in-deutschland (61.793 Einträge)
 *
 * ConfigData:
 *   {
 *     "apiurls": [{ "name": "ladesaeulen", "label": "...", "url": "https://opendata.rhein-kreis-neuss.de/api/explore/v2.1/catalog/datasets/rhein-kreis-neuss-ladesaulen-in-deutschland/records" }]
 *   }
 *   oder
 *   {
 *     "apiurls": [{ "name": "ladesaeulen", "label": "...", "url": "https://<portal>/api/3/action/datastore_search?resource_id=<resource-id>" }]
 *   }
 *
 * @param {Object} configdata
 * @param enclosingHtmlDivElement
 * @returns NULL
 */
let lsInstanzZaehler = 0;

// F-43: Registrierte Instanzen (Container -> State), damit der Top-Level-Hook
// onPageLeave() alle gemounteten Instanzen aufraeumen kann. Die Base ruft den
// Hook global ohne Container-Parameter auf; eine iterierbare Map ist daher das
// zur App passende Muster (Portfolio-Muster aus Task 9.1).
const ladesaeulenInstances = new Map();

// LS-B1: Teardown als Funktion, damit ihn neben onPageLeave auch ein
// Same-Page-Re-Render für die VORGÄNGER-Instanz laufen lassen kann (sonst
// leaken alte Karte + Dokument-Listener bei jedem Re-Render).
function teardownLadesaeulenInstanz(state, container) {
  state.disposed = true;
  state.fetchToken += 1; // F-44: laufende Abrufe invalidieren
  state.acToken += 1; // F-44: laufende Autocomplete-Timer invalidieren
  (state.listeners || []).forEach(([el, type, fn, capture]) => {
    el.removeEventListener(type, fn, capture);
  });
  state.listeners = [];
  if (state.acDebounce) {
    clearTimeout(state.acDebounce);
    state.acDebounce = null;
  }
  if (state.resizeTimeout) {
    clearTimeout(state.resizeTimeout);
    state.resizeTimeout = null;
  }
  if (state.suggestionsEl && state.suggestionsEl.parentNode) {
    state.suggestionsEl.parentNode.removeChild(state.suggestionsEl);
  }
  if (state.map) {
    try {
      state.map.remove();
    } catch (error) {
      console.warn("Fehler beim Entfernen der Leaflet-Karte:", error);
    }
    state.map = null;
  }
  ladesaeulenInstances.delete(container);
}

function onPageLeave(page) {
  [...ladesaeulenInstances.entries()].forEach(([container, state]) => {
    try {
      teardownLadesaeulenInstanz(state, container);
    } catch (_e) {}
  });
}

/* ── Sanity-Check: erkennt ungültige oder aus Beispieltext übernommene apiurl-Werte ── */
function isValidApiUrl(url) {
  const value = String(url || "").trim();
  if (!value) return false;
  if (/<[^>]+>/.test(value)) return false; // Platzhalter-Tokens wie <portal>/<resource-id>
  if (/\boder\b/i.test(value)) return false; // zusammengesetzter Beispieltext ("... oder ...")
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (e) {
    return false;
  }
}

function isOdasProxyEnabled(configdata = {}) {
  return String(configdata.proxyAktiv || "").trim().toLowerCase() === "ja";
}

function extractPathFromUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.pathname + parsedUrl.search;
  } catch (_error) {
    return String(url || "");
  }
}

function getOdasAppBasePath(pathname) {
  let appPath =
    pathname === undefined
      ? typeof window !== "undefined"
        ? window.location.pathname
        : "/"
      : String(pathname || "/");

  if (!appPath.endsWith("/")) {
    const lastSlashIndex = appPath.lastIndexOf("/");
    const lastSegment = appPath.substring(lastSlashIndex + 1);
    if (lastSegment.includes(".")) {
      appPath = appPath.substring(0, lastSlashIndex + 1);
    }
  }

  return appPath.replace(/\/+$/, "");
}

function getOdasProxyEndpoint(targetUrl, pathname) {
  const appPath = getOdasAppBasePath(pathname);
  return `${appPath}/odp-data?path=${encodeURIComponent(targetUrl)}`;
}

async function fetchViaOdasProxy(targetUrl, options = {}) {
  if (typeof isKeineDatenquelleKonfiguriert === "function" && isKeineDatenquelleKonfiguriert(targetUrl)) {
    throw new Error("Keine Datenquelle konfiguriert.");
  } else if (typeof isKeineDatenquelleKonfiguriert !== "function") {
    const v = String(targetUrl || "").trim();
    if (!v || /^\{\{.*\}\}$/.test(v) || /^<.*>$/.test(v)) throw new Error("Keine Datenquelle konfiguriert.");
  }

  const response = await fetch(getOdasProxyEndpoint(targetUrl), {
    method: "POST",
    signal: options && options.signal ? options.signal : undefined,
  });

  if (!response.ok) {
    let body = "";
    try {
      body = await response.text();
    } catch (_e) {}
    const originHint = /origin not allowed/i.test(body) ? " – URL origin not allowed" : "";
    throw new Error(`ODAS-Proxy-Fehler: HTTP ${response.status}${originHint}`);
  }

  const proxyData = await response.json();
  if (!proxyData || typeof proxyData.content !== "string") {
    throw new Error("ODAS-Proxy-Antwort enthält keinen content-String.");
  }

  return proxyData.content;
}

async function fetchOdasResource(targetUrl, configdata = {}) {
  if (isOdasProxyEnabled(configdata)) {
    return fetchViaOdasProxy(targetUrl);
  }

  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.text();
  } catch (error) {
    throw new Error(
      `Direkter Datenabruf fehlgeschlagen (${error.message}). Bitte prüfen Sie die Daten-URL und die CORS-Freigabe der Datenquelle.`,
    );
  }
}

/**
 * Löst eine benannte Datenressource aus configdata.apiurls auf.
 * Neue apiurls-Form (typ: "array"); das frühere skalare apiurl wird nicht mehr gelesen.
 * @returns {string} getrimmte URL, oder "" für den Zustand "keine Quelle konfiguriert"
 */
function getOdasApiUrl(configdata, name) {
  const liste = Array.isArray(configdata && configdata.apiurls) ? configdata.apiurls : [];
  const treffer = liste.find((eintrag) => eintrag && eintrag.name === name);
  return String((treffer && treffer.url) || "").trim();
}

async function fetchOdasJson(targetUrl, configdata = {}) {
  const rawContent = await fetchOdasResource(targetUrl, configdata);
  try {
    return JSON.parse(rawContent);
  } catch (_error) {
    throw new Error(
      `Die konfigurierte Daten-URL liefert kein JSON, sondern ${describeNonJsonPayload(rawContent)}. ` +
        "Bitte in der Instanzkonfiguration den API-Endpunkt der Datenquelle eintragen, " +
        "nicht den Datensatz- oder Download-Link.",
    );
  }
}

function describeNonJsonPayload(rawContent) {
  const text = String(rawContent == null ? "" : rawContent).trim();
  if (!text) return "eine leere Antwort";
  if (text.startsWith("<")) return "eine HTML-Seite";
  const firstLine = text.split(/\r?\n/, 1)[0];
  if (/[,;]/.test(firstLine)) return "eine CSV- oder Textdatei";
  return "unlesbaren Inhalt";
}

function isKeineDatenquelleKonfiguriert(targetUrl) {
  const quelle = String(targetUrl || "").trim();
  return !quelle || /^\{\{.*\}\}$/.test(quelle) || /^<.*>$/.test(quelle);
}


const TYP_BEZEICHNUNG = {
  "ckan-dkan-ds": "Tabellen-API mit Daten-ID",
  "ckan-ps": "Datensatz-API",
  "ckan-dl": "Datei-Download",
  "ods21": "Open-Data-Suche (API v2.1)",
  "wfs": "Kartendienst (WFS)",
  "sparql": "Wissensdatenbank (SPARQL)",
  "csv-zip": "Statische Datei"
};

function validateUrlTypErwartung(url, erwarteterTyp) {
  const u = String(url || "");
  if (!erwarteterTyp || isKeineDatenquelleKonfiguriert(u)) return null;
  const checks = {
    "ckan-dkan-ds": /\/api\/3\/action\/datastore_search\?resource_id=/i,
    "ckan-ps": /\/api\/3\/action\/package_show\?id=/i,
    "ckan-dl": /\/dataset\/.*\/resource\/.*\/download\//i,
    "ods21": /\/api\/explore\/v2\.1\//i,
    "wfs": /service=WFS/i,
    "sparql": /\/api\/ts\/v1\/kg\/sparql/i,
    "csv-zip": /\.(csv|json|zip)(\?|$)/i
  };
  const re = checks[erwarteterTyp];
  if (!re) return null;
  if (!re.test(u)) {
    const soll = TYP_BEZEICHNUNG[erwarteterTyp] || erwarteterTyp;
    return `Typ passt nicht: erwartet „${soll}", erhalten „${u.slice(0, 60)}…". Prüfen Sie den Hilfe-Tooltip bei „URLs zu Datenressourcen".`;
  }
  return null;
}

function classifyOdasFehler(error, kontext = {}) {
  const msg = String((error && error.message) || error || "");
  const url = String(kontext.url || "");
  const label = String(kontext.label || "Datenressource");
  const typLabel = String(kontext.typLabel || TYP_BEZEICHNUNG[kontext.erwarteterTyp] || "Datenquelle");
  if (/Keine Datenquelle konfiguriert/i.test(msg) || isKeineDatenquelleKonfiguriert(url)) {
    return {
      kind: "KEINE_QUELLE",
      titel: "Es ist keine Datenquelle konfiguriert.",
      hinweis: `Prüfen Sie unter „URLs zu Datenressourcen → ${label}" ob eine gültige ${typLabel}-URL eingetragen ist (Hilfe-Tooltip beachten).`,
      detail: msg,
      alertClass: "alert-info"
    };
  }
  if (/Typ passt nicht: erwartet/i.test(msg)) {
    return {
      kind: "TYP_MISMATCH",
      titel: msg,
      hinweis: `Diese App erwartet ${typLabel}. Korrigieren Sie die URL gemäß Hilfe-Tooltip (Beispiel dort).`,
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/URL origin not allowed/i.test(msg)) {
    return {
      kind: "PROXY_ORIGIN",
      titel: "ODAS-Proxy blockiert: Ziel-Origin nicht freigegeben.",
      hinweis: "Tragen Sie die Ziel-Origin als eigenen Eintrag unter „URLs zu Datenressourcen“ ein oder prüfen Sie proxyAktiv.",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/ODAS-Proxy-Fehler/i.test(msg) || /kein content-String/i.test(msg)) {
    return {
      kind: "PROXY_HTTP",
      titel: msg,
      hinweis: "Prüfen Sie proxyAktiv und Erreichbarkeit im ODAS-Live-System (lokal 404 ist normal).",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/Direkter Datenabruf fehlgeschlagen/i.test(msg) || /Failed to fetch/i.test(msg)) {
    const corsHint = /Failed to fetch/i.test(msg) ? " – vermutlich CORS blockiert → im ODAS-Live proxyAktiv=ja." : "";
    return {
      kind: "DIREKT_CORS_HTTP",
      titel: msg,
      hinweis: `Prüfen Sie URL und CORS der Quelle${corsHint}`,
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/liefert kein JSON/i.test(msg) || /HTML-Seite|CSV-|leere Antwort|unlesbaren/i.test(msg)) {
    return {
      kind: "PAYLOAD_TYP",
      titel: msg,
      hinweis: "Tragen Sie den passenden Endpunkt ein – nicht die Datensatzseite (/dataset/…) – Hilfe-Tooltip beachten.",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/CKAN.*Fehler|success:false/i.test(msg)) {
    return {
      kind: "CKAN_API",
      titel: msg,
      hinweis: "Prüfen Sie Daten-ID / Datensatz-ID (existiert die Tabelle/Datei noch auf dem Portal?).",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  if (/404|Nicht gefunden/i.test(msg)) {
    return {
      kind: "HTTP_404",
      titel: msg,
      hinweis: "Ressource/Datensatz auf dem Portal nicht gefunden (404).",
      detail: msg,
      alertClass: "alert-danger"
    };
  }
  return {
    kind: "UNBEKANNT",
    titel: msg || "Unbekannter Fehler beim Laden.",
    hinweis: "Prüfen Sie Konfiguration und Erreichbarkeit der Quelle.",
    detail: msg,
    alertClass: "alert-danger"
  };
}

function renderOdasFehler(container, error, kontext = {}) {
  if (!container) return;
  // Mehrere akzeptierte URL-Typen: erst warnen, wenn kein einziger passt.
  const typen = Array.isArray(kontext.erwarteteTypen) && kontext.erwarteteTypen.length
    ? kontext.erwarteteTypen
    : [kontext.erwarteterTyp];
  let typWarn = null;
  for (const t of typen) {
    typWarn = validateUrlTypErwartung(kontext.url, t);
    if (!typWarn) break;
  }
  if (typWarn && !/Typ passt nicht/i.test(String(error && error.message))) {
    error = new Error(typWarn);
  }
  const info = classifyOdasFehler(error, kontext);
  const url = String(kontext.url || "");
  const urlZeile = url ? `<p class="mb-1 small text-muted">Konfigurierte URL: <code>${escapeHtml(url.length > 80 ? url.slice(0, 80) + "…" : url)}</code></p>` : "";
  const titel = kontext.leer ? "Keine Datensätze gefunden." : info.titel;
  const alertClass = kontext.leer ? "alert-info" : info.alertClass;
  container.innerHTML = `<div class="alert ${alertClass}" role="alert"><strong>${escapeHtml(titel)}</strong><p class="mb-1">${escapeHtml(info.hinweis)}</p>${urlZeile}<details class="small"><summary>Details</summary><code>${escapeHtml(info.detail || String(error))}</code></details></div>`;
}

// R2-005: Zeilen je Tabellenschritt (DOM-Umfang bei großen Beständen begrenzen).
const LS_ZEILEN_SCHRITT = 200;

function app(configdata = {}, enclosingHtmlDivElement) {
  const lsUid = "i" + ++lsInstanzZaehler;
  const BASE_URL = getOdasApiUrl(configdata, "ladesaeulen");

  // F-42: pro Instanz geschlossener Runtime-State. `listeners` sammelt die
  // dokument-/window-weiten Listener-Referenzen (keydown/resize/scroll) als
  // [el, type, fn, capture]-Tupel — Task 9.2 (F-43) entfernt sie im
  // onPageLeave-Teardown über `state.listeners`.
  const state = {
    uid: lsUid,
    root: enclosingHtmlDivElement,
    config: configdata || {},
    listeners: [],
    fetchToken: 0, // F-44: monotoner Token für fetchStationen-Abrufe
    acToken: 0, // F-44: monotoner Token je Autocomplete-Eingabe
    resizeTimeout: null,
  };
  state.disposed = false; // wird in Task 9 (onPageLeave) gesetzt
  const lsVorinstanz = ladesaeulenInstances.get(enclosingHtmlDivElement);
  if (lsVorinstanz) {
    try {
      teardownLadesaeulenInstanz(lsVorinstanz, enclosingHtmlDivElement);
    } catch (_e) {}
  }
  ladesaeulenInstances.set(enclosingHtmlDivElement, state);

  const lsKontext = {
    url: BASE_URL,
    label: "Ladesäulen-API",
    typLabel: "Open-Data-Suche (API v2.1)",
    erwarteteTypen: ["ods21", "ckan-dkan-ds"],
  };
  if (!isValidApiUrl(BASE_URL)) {
    renderOdasFehler(
      enclosingHtmlDivElement,
      new Error("Keine Datenquelle konfiguriert."),
      lsKontext,
    );
    return null;
  }

  // Variante A (F-92): Typprüfung vor dem ersten Fetch. LS-B2: neben der
  // ODS-Suche sind CKAN-Tabellen zulässig (detectApiType + fetchAllPagesCkan
  // existieren längst, waren aber unerreichbar).
  const lsOdsWarn = validateUrlTypErwartung(BASE_URL, "ods21");
  const lsTypWarn = lsOdsWarn && validateUrlTypErwartung(BASE_URL, "ckan-dkan-ds") ? lsOdsWarn : null;
  if (lsTypWarn) {
    renderOdasFehler(enclosingHtmlDivElement, new Error(lsTypWarn), lsKontext);
    return null;
  }

  enclosingHtmlDivElement.innerHTML = `
    <div class="card mb-3 border-0 shadow-sm">
      <div class="card-body py-3">
        <div class="text-end mb-1"><small id="ls-datenstand-${lsUid}" class="text-muted"></small></div>
        <div class="row g-2 align-items-start">
          <div class="col-12 col-md-7">
            <label class="form-label fw-semibold mb-1">🔍 Stadt oder PLZ</label>
            <div class="input-group has-validation">
              <input type="text" id="ort-input-${lsUid}" class="form-control"
                placeholder="z. B. Frankfurt oder 60311"
                autocomplete="off" aria-label="Stadt oder PLZ" />
              <button class="btn btn-success" id="suche-btn-${lsUid}">Suchen</button>
              <button class="btn btn-outline-success" id="ls-btn-nah-${lsUid}" type="button" title="Ladesäulen in der Nähe suchen">📍</button>
              <div class="invalid-feedback">Bitte Stadt oder PLZ eingeben.</div>
            </div>
          </div>
          <div class="col-12 col-md-5">
            <label class="form-label fw-semibold mb-1">🔌 Steckertyp</label>
            <div class="d-flex gap-2 align-items-center">
              <select id="filter-stecker-${lsUid}" class="form-select">
                <option value="">Alle</option>
                <option value="CCS">CCS (DC Combo)</option>
                <option value="CHAdeMO">CHAdeMO</option>
                <option value="AC Typ 2">AC Typ 2</option>
                <option value="AC Schuko">AC Schuko</option>
              </select>
              <div id="treffer-badge-${lsUid}" class="text-nowrap"></div>
              <button id="ls-btn-export-${lsUid}" type="button" class="btn btn-sm btn-outline-secondary" title="Geladene Stationen als CSV laden">CSV</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div id="ls-ladestation-map-${lsUid}" style="height: 500px; border-radius: 10px; overflow: hidden; z-index:0; position:relative;">
      <button id="fullscreen-btn-${lsUid}" title="Vollbild"
        style="position:absolute;top:10px;right:10px;z-index:1000;
               background:#fff;border:2px solid rgba(0,0,0,.3);border-radius:6px;
               width:34px;height:34px;cursor:pointer;font-size:16px;line-height:1;
               display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.3);">
        ⛶
      </button>
    </div>

    <div id="ladestation-list-${lsUid}" class="mt-4">
      <div class="text-center py-5 text-muted">
        <div style="font-size:2.5rem;">⚡</div>
        <p class="mt-2">Gib eine Stadt oder PLZ ein und klicke auf <strong>Suchen</strong>.</p>
      </div>
    </div>

    ${renderWeitereInfos(configdata)}${renderMethodikbox(configdata, lsUid)}
  `;

  loadLeaflet().then(() => {
    if (state.disposed) return;
    initMap(enclosingHtmlDivElement, BASE_URL, configdata, lsUid, state);
  }).catch((err) => {
    if (state.disposed) return;
    renderOdasFehler(enclosingHtmlDivElement, err, lsKontext);
  });
  return null;
}

/* ── Leaflet dynamisch laden ── */
function loadLeaflet() {
  return new Promise((resolve, reject) => {
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "vendor/leaflet/leaflet.css";
      document.head.appendChild(link);
    }
    if (!document.getElementById("leaflet-cluster-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-cluster-css";
      link.rel = "stylesheet";
      link.href =
        "vendor/markercluster/MarkerCluster.css";
      document.head.appendChild(link);
      const link2 = document.createElement("link");
      link2.id = "leaflet-cluster-default-css";
      link2.rel = "stylesheet";
      link2.href =
        "vendor/markercluster/MarkerCluster.Default.css";
      document.head.appendChild(link2);
    }
    // LS-B3: ohne onerror hängt ein fehlendes Vendor-File die Kette für immer.
    function loadScript(src, id) {
      return new Promise((res, rej) => {
        if (document.getElementById(id)) {
          res();
          return;
        }
        const s = document.createElement("script");
        s.id = id;
        s.src = src;
        s.onload = res;
        s.onerror = () => rej(new Error("Bibliothek konnte nicht geladen werden: " + src));
        document.head.appendChild(s);
      });
    }
    const leafletReady =
      typeof L !== "undefined"
        ? Promise.resolve()
        : loadScript(
            "vendor/leaflet/leaflet.js",
            "leaflet-js",
          );
    leafletReady
      .then(() =>
        loadScript(
          "vendor/markercluster/leaflet.markercluster.js",
          "leaflet-cluster-js",
        ),
      )
      .then(resolve, reject);
  });
}

/* ── Karte und Logik initialisieren ── */
function initMap(root, BASE_URL, configdata, lsUid, state) {
  if (state.disposed) return;
  const map = L.map(root.querySelector("#ls-ladestation-map-" + lsUid)).setView([51.165, 10.451], 6);
  state.map = map;

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
  let geoEntferntAnzahl = 0; // Ausreißer-Jenseits-Limit/unkorrigierbar (F-73)
  const datenstandCache = {}; // datasetId -> Datenstand (ein Meta-Call genügt)
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
      .map((t) => `<span class="badge bg-secondary me-1">${escapeHtml(t)}</span>`)
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

  // Fetch mit Timeout — hängende Requests dürfen weder Suche noch
  // Geocoding ewig blockieren.
  async function fetchMitTimeout(url, millis) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), millis);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
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
      const res = await fetchMitTimeout(
        `https://photon.komoot.io/api/?q=${q}&limit=1&lang=de`,
        8000,
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

  // Ausreißer-Geocoding ist auf die ersten 25 begrenzt — sonst stallt eine
  // Großstadt-Suche an N×RTT. Entfernte Treffer werden gezählt (F-73).
  const LS_MAX_GEOCODE = 25;

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
    const ausreisser = [];
    for (const s of stationen) {
      const c = getCoord(s);
      if (!c) continue;
      if (haversine(c.lat, c.lon, medLat, medLon) <= maxKm) {
        result.push(s);
      } else {
        ausreisser.push(s);
      }
    }
    // Jenseits des Limits: weglassen und zählen (statt still zu verwerfen).
    geoEntferntAnzahl += Math.max(0, ausreisser.length - LS_MAX_GEOCODE);
    const fixes = await Promise.all(
      ausreisser.slice(0, LS_MAX_GEOCODE).map((s) => geocodeStation(s)),
    );
    ausreisser.slice(0, LS_MAX_GEOCODE).forEach((s, i) => {
      const fixed = fixes[i];
      if (fixed && haversine(fixed.lat, fixed.lon, medLat, medLon) <= maxKm) {
        // Korrigierte Koordinaten in eine Kopie schreiben
        result.push({ ...s, koordinaten: fixed });
      } else {
        // Nicht korrigierbar: weglassen und zählen.
        geoEntferntAnzahl += 1;
      }
    });
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
          <div class="fw-bold mb-1">${escapeHtml(s.betreiber) || "Unbekannter Betreiber"}</div>
          <div class="text-muted small mb-2">${escapeHtml(adresse)}<br>${escapeHtml(ort)}</div>
          <table class="table table-sm table-borderless mb-1" style="font-size:.85rem">
            <tr><td class="text-muted pe-2">Typ</td>
                <td>${
                  schnell
                    ? '<span class="badge bg-danger">Schnelllader ⚡⚡</span>'
                    : '<span class="badge bg-success">Normallader ⚡</span>'
                }</td></tr>
            <tr><td class="text-muted pe-2">Ladepunkte</td>
                <td><strong>${escapeHtml(s.anzahl_ladepunkte ?? "–")}</strong></td></tr>
            <tr><td class="text-muted pe-2">Leistung</td>
                <td>${escapeHtml(getKw(s))}</td></tr>
            <tr><td class="text-muted pe-2">Stecker</td>
                <td>${getStecker(s) || "–"}</td></tr>
            <tr><td class="text-muted pe-2">In Betrieb</td>
                <td>${escapeHtml(inbetrieb)}</td></tr>
          </table>
          ${s.anzeigename_karte ? `<div class="text-muted small mb-2">${escapeHtml(s.anzeigename_karte)}</div>` : ""}
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
    const listEl = root.querySelector("#ladestation-list-" + lsUid);
    if (stationen.length === 0) {
      listEl.innerHTML = `<div class="alert alert-info" role="alert">Keine Ladestationen gefunden.</div>`;
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
    // F-73: Ladestationen ohne gültige Koordinaten fallen nur von der Karte
    // weg, bleiben aber in der Tabelle/den KPIs sichtbar; Anzahl wird gemeldet.
    const ohneKoordinatenAnzahl = stationen.filter((s) => !getCoord(s)).length;

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
            `<th data-col="${escapeHtml(key)}" class="user-select-none" style="cursor:pointer;white-space:nowrap;">${escapeHtml(col.label)}${sortIcon(key)}</th>`,
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

    // R2-005: zunächst LS_ZEILEN_SCHRITT Zeilen, weitere per „Weitere anzeigen“;
    // Kennzahlen, Karte, Steckerfilter und Export beziehen sich weiter auf alle Stationen.
    let sortedAktuell = [];
    let angezeigt = 0;
    function zeileHtml({ s, i }) {
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
                  title="${escapeHtml(s.betreiber ?? "")}">${escapeHtml(s.betreiber) || "–"}</td>
              <td>
                <div style="font-size:.85rem">${escapeHtml(adresse)}</div>
                <div class="text-muted" style="font-size:.75rem">${escapeHtml(ort)}</div>
              </td>
              <td style="white-space:nowrap">${
                schnell
                  ? '<span class="badge bg-danger">Schnell ⚡⚡</span>'
                  : '<span class="badge bg-success">Normal ⚡</span>'
              }</td>
              <td class="text-center">${escapeHtml(s.anzahl_ladepunkte ?? "–")}</td>
              <td style="white-space:nowrap">${s.nennleistung_ladeeinrichtung_kw ? escapeHtml(s.nennleistung_ladeeinrichtung_kw) + " kW" : "–"}</td>
              <td style="font-size:.78rem">${escapeHtml(getSteckerText(s)) || "–"}</td>
            </tr>`;
    }

    function mehrButtonHtml() {
      if (angezeigt >= sortedAktuell.length) return "";
      const weitere = Math.min(LS_ZEILEN_SCHRITT, sortedAktuell.length - angezeigt);
      return `<button type="button" class="btn btn-outline-secondary btn-sm mt-2 lade-mehr">Weitere ${weitere.toLocaleString("de-DE")} anzeigen (${angezeigt.toLocaleString("de-DE")} von ${sortedAktuell.length.toLocaleString("de-DE")} angezeigt)</button>`;
    }

    function renderTbody() {
      sortedAktuell = getSorted();
      angezeigt = Math.min(sortedAktuell.length, LS_ZEILEN_SCHRITT);
      tbody.innerHTML = sortedAktuell.slice(0, angezeigt).map(zeileHtml).join("");
      mehrWrap.innerHTML = mehrButtonHtml();
    }

    listEl.innerHTML = `
      <div class="row g-3 mb-4">
        <div class="col-12 col-md-4">
          <div class="card text-center border-0 bg-success bg-opacity-10">
            <div class="card-body py-2">
              <div class="fs-4 fw-bold text-success">${stationen.length}</div>
              <div class="small text-muted">Ladesäulen</div>\n              ${kpiContext(configdata.kpiKontext1, "1", lsUid)}
            </div>
          </div>
        </div>
        <div class="col-12 col-md-4">
          <div class="card text-center border-0 bg-primary bg-opacity-10">
            <div class="card-body py-2">
              <div class="fs-4 fw-bold text-primary">${gesamtPunkte}</div>
              <div class="small text-muted">Ladepunkte gesamt</div>\n              ${kpiContext(configdata.kpiKontext2, "2", lsUid)}
            </div>
          </div>
        </div>
        <div class="col-12 col-md-4">
          <div class="card text-center border-0 bg-warning bg-opacity-10">
            <div class="card-body py-2">
              <div class="fs-4 fw-bold text-warning">${maxKw > 0 ? maxKw + " kW" : "–"}</div>
              <div class="small text-muted">Max. Leistung</div>\n              ${kpiContext(configdata.kpiKontext3, "3", lsUid)}
            </div>
          </div>
        </div>
      </div>

      ${
        ohneKoordinatenAnzahl > 0 || geoEntferntAnzahl > 0
          ? `<div class="alert alert-info" role="alert">${
              ohneKoordinatenAnzahl > 0
                ? `${ohneKoordinatenAnzahl} von ${stationen.length} Ladestationen konnten mangels gültiger Koordinaten nicht auf der Karte angezeigt werden (weiterhin in der Tabelle sichtbar).`
                : ""
            }${
              geoEntferntAnzahl > 0
                ? ` ${geoEntferntAnzahl} Treffer lagen zu weit außerhalb des Suchraums und wurden weggelassen.`
                : ""
            }</div>`
          : ""
      }

      <h6 class="mb-2 fw-semibold">Alle Ladesäulen</h6>
      <div class="text-muted small mb-2">Tipp: Klick auf eine Zeile zentriert die Karte. <span class="d-none d-md-inline">Sortierung über die Spaltenköpfe.</span></div>
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
            <tr id="sort-header-${lsUid}">${headerHtml()}</tr>
          </thead>
          <tbody id="ladestation-tbody-${lsUid}"></tbody>
        </table>
      </div>
      <div class="lade-mehr-wrap"></div>
`;

    const tbody = listEl.querySelector("#ladestation-tbody-" + lsUid);
    const mehrWrap = listEl.querySelector(".lade-mehr-wrap");

    // Klick auf Zeile → Karte zentrieren & Popup öffnen (delegiert, gilt auch für nachgeladene Zeilen)
    tbody.addEventListener("click", (event) => {
      const row = event.target.closest("tr");
      if (!row) return;
      const lat = parseFloat(row.dataset.lat);
      const lon = parseFloat(row.dataset.lon);
      const idx = parseInt(row.dataset.idx);
      if (!lat || !lon) return;
      map.setView([lat, lon], 17);
      markers[idx]?.marker.openPopup();
      root
        .querySelector("#ls-ladestation-map-" + lsUid)
        .scrollIntoView({ behavior: "smooth", block: "center" });
    });

    mehrWrap.addEventListener("click", (event) => {
      if (!event.target.closest(".lade-mehr")) return;
      const naechste = sortedAktuell.slice(angezeigt, angezeigt + LS_ZEILEN_SCHRITT);
      tbody.insertAdjacentHTML("beforeend", naechste.map(zeileHtml).join(""));
      angezeigt += naechste.length;
      mehrWrap.innerHTML = mehrButtonHtml();
    });

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
    const badge = root.querySelector("#treffer-badge-" + lsUid);
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
    // F-44: Jeder Abruf bekommt einen monotonen Token; nur die Antwort des
    // aktuellsten Abrufs darf State, Karte, Liste und Ladeanzeige ändern.
    const token = ++state.fetchToken;
    // displayWert = was im Input steht (Ortsname); suchWert = was an die API geht (PLZ oder Ort)
    const ortDisplay = displayWert ?? suchWert;
    const listEl = root.querySelector("#ladestation-list-" + lsUid);
    listEl.innerHTML = `
      <div class="text-center py-5 text-muted">
        <div class="spinner-border text-success mb-3" role="status"></div>
        <p>Lade Daten…</p>
      </div>`;
    markerGroup.clearLayers();
    markers = [];
    alleStationenRaw = [];
    geoEntferntAnzahl = 0;
    geladenerOrt = null;
    updateBadge(null);

    // WHERE-Klausel — nur Ort/PLZ serverseitig filtern; Stecker wird clientseitig gefiltert
    const conditions = [];
    const suchText = (suchWert || "").trim();
    const istPlz = /^\d{4,5}$/.test(suchText);

    if (suchText) {
      if (istPlz) {
        conditions.push(`postleitzahl LIKE '${escapeSqlString(suchText)}%'`);
      } else {
        conditions.push(`ort LIKE '%${escapeSqlString(suchText)}%'`);
      }
    }

    const where = conditions.length > 0 ? conditions.join(" AND ") : null;

    async function fetchAllPagesOds() {
      var datasetId = BASE_URL.split("/catalog/datasets/")[1]?.split("/")[0] || "";
      if (datasetId) {
        if (datenstandCache[datasetId]) {
          var badge0 = root.querySelector("#ls-datenstand-" + lsUid);
          if (badge0) badge0.textContent = "Aktualisiert: " + datenstandCache[datasetId];
        } else {
          var catUrl = BASE_URL.substring(0, BASE_URL.indexOf("/catalog/datasets/")) + "/catalog/datasets/" + datasetId;
          fetchOdasJson(catUrl, configdata).then(function(meta) {
            // F-44: nur der aktuelle Abruf darf den Datenstand schreiben
            if (token !== state.fetchToken) return;
            var stand = extractDatenStand(meta);
            if (stand) {
              datenstandCache[datasetId] = stand;
              var badge = root.querySelector("#ls-datenstand-" + lsUid);
              if (badge) badge.textContent = "Aktualisiert: " + stand;
            }
          }).catch(function() {});
        }
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

        const data = await fetchOdasJson(reqUrl, configdata);
        // F-44: Abruf überholt? Dann keine Fortschrittsanzeige mehr und abbrechen.
        if (token !== state.fetchToken) return null;

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

        const data = await fetchOdasJson(reqUrl, configdata);
        // F-44: Abruf überholt? Dann keine Fortschrittsanzeige mehr und abbrechen.
        if (token !== state.fetchToken) return null;
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
        // F-44: Antwort eines überholten Abrufs vollständig verwerfen
        if (token !== state.fetchToken) return;
        // F-73: Datensätze ohne gültige Koordinaten werden NICHT mehr komplett
        // verworfen — sie bleiben für Tabelle/KPIs erhalten und fehlen nur auf
        // der Karte, wo sie sich nicht platzieren lassen.
        const valid = results.filter((s) => !!getCoord(s));
        const ohneKoordinaten = results.filter((s) => !getCoord(s));

        // Ladetext während Geocoding aktualisieren
        const p = listEl.querySelector("p");
        if (p && valid.length > 0) p.textContent = "Prüfe Koordinaten…";

        const fixed = await fixOutliers(valid);
        // F-44: fixOutliers-Ergebnis nur bei aktuellem Token anwenden
        if (token !== state.fetchToken) return;
        alleStationenRaw = fixed.concat(ohneKoordinaten);
        if (state.disposed) return;
        geladenerOrt = ortDisplay;
        geladenerSuchWert = suchWert;
        applySteckerFilter(root.querySelector("#filter-stecker-" + lsUid).value);
      })
      .catch((err) => {
        // F-44: Fehler eines überholten Abrufs nicht mehr anzeigen
        if (token !== state.fetchToken) return;
        renderOdasFehler(listEl, err, {
          url: BASE_URL,
          label: "Ladesäulen-API",
          typLabel: "Open-Data-Suche (API v2.1)",
          erwarteteTypen: ["ods21", "ckan-dkan-ds"],
        });
        updateBadge(0);
      });
  }

  /* ── Event-Handler ── */
  const sucheBtn = root.querySelector("#suche-btn-" + lsUid);
  const ortInput = root.querySelector("#ort-input-" + lsUid);
  const filterStecker = root.querySelector("#filter-stecker-" + lsUid);

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
  const mapEl = root.querySelector("#ls-ladestation-map-" + lsUid);
  const fsBtn = root.querySelector("#fullscreen-btn-" + lsUid);
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
    if (state.resizeTimeout) clearTimeout(state.resizeTimeout);
    state.resizeTimeout = setTimeout(() => {
      state.resizeTimeout = null;
      if (state.disposed || !state.map) return;
      state.map.invalidateSize();
    }, 50);
  });

  // Vollbild auch mit Escape beenden — Listener-Referenz im Instanz-State
  // ablegen, damit Task 9.2 (F-43) sie im onPageLeave-Teardown entfernt.
  const escapeListener = (e) => {
    if (e.key === "Escape" && isFullscreen) fsBtn.click();
  };
  document.addEventListener("keydown", escapeListener);
  state.listeners.push([document, "keydown", escapeListener, false]);

  sucheBtn.addEventListener("click", triggerSuche);

  /* ── Nähe-Suche: eigener Standort → Photon-Reverse → PLZ/Ort ── */
  const nahBtn = root.querySelector("#ls-btn-nah-" + lsUid);
  const zeigeNahStatus = (text) => {
    const badge = root.querySelector("#treffer-badge-" + lsUid);
    if (badge) badge.innerHTML = `<span class="badge bg-warning fs-6">${escapeHtml(text)}</span>`;
  };
  if (nahBtn) {
    nahBtn.addEventListener("click", () => {
      if (state.disposed) return;
      if (!navigator.geolocation) {
        zeigeNahStatus("Standort nicht unterstützt");
        return;
      }
      nahBtn.disabled = true;
      const fertig = () => {
        nahBtn.disabled = false;
      };
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (state.disposed) {
            fertig();
            return;
          }
          try {
            const rev = await fetchMitTimeout(
              `https://photon.komoot.io/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&lang=de`,
              8000,
            );
            if (state.disposed) {
              fertig();
              return;
            }
            const data = await rev.json();
            const props = (data.features && data.features[0] && data.features[0].properties) || {};
            const plz = props.postcode || "";
            const ort = props.city || props.town || props.village || props.name || "";
            const suchWert = plz || ort;
            if (!suchWert) throw new Error("kein Ort gefunden");
            ortInput.value = ort || plz;
            ortInput.classList.remove("is-invalid");
            fertig();
            fetchStationen(suchWert, ort || plz);
          } catch {
            fertig();
            if (state.disposed) return;
            zeigeNahStatus("Standort nicht bestimmbar");
          }
        },
        (fehler) => {
          fertig();
          if (state.disposed) return;
          zeigeNahStatus(
            fehler && fehler.code === 1 ? "Standortzugriff verweigert" : "Standort nicht bestimmbar",
          );
        },
        { timeout: 10000 },
      );
    });
  }

  /* ── CSV-Export der geladenen Stationen ── */
  const expBtn = root.querySelector("#ls-btn-export-" + lsUid);
  if (expBtn) {
    expBtn.addEventListener("click", () => {
      if (state.disposed || alleStationen.length === 0) return;
      const esc = (v) => {
        const s = String(v ?? "");
        return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const zeilen = ["Betreiber;Strasse;Hausnummer;PLZ;Ort;Typ;Ladepunkte;Leistung kW;Stecker;Breite;Laenge"];
      alleStationen.forEach((s) => {
        const c = getCoord(s);
        zeilen.push(
          [
            s.betreiber, s.strasse, s.hausnummer, s.postleitzahl, s.ort,
            istSchnell(s) ? "Schnell" : "Normal", s.anzahl_ladepunkte ?? "",
            s.nennleistung_ladeeinrichtung_kw ?? "", getSteckerText(s),
            c ? c.lat : "", c ? c.lon : "",
          ]
            .map(esc)
            .join(";"),
        );
      });
      const blob = new Blob(["\uFEFF" + zeilen.join("\r\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ladesaeulen-export.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  /* ── Autocomplete ── */
  // Suggestions-Liste in den App-Root hängen (nicht document.body), damit sie
  // zur Instanz gehört und ihre ID instanzeindeutig ist; die Positionierung ist
  // viewport-basiert (position:fixed + getBoundingClientRect), kein Ancestor
  // bildet einen neuen Containing-Block (kein transform/filter/will-change).
  const suggestionsEl = document.createElement("ul");
  suggestionsEl.id = "ort-suggestions-" + lsUid;
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
  root.appendChild(suggestionsEl);
  state.suggestionsEl = suggestionsEl;

  function positionSuggestions() {
    const rect = ortInput.getBoundingClientRect();
    suggestionsEl.style.top = rect.bottom + window.scrollY + "px";
    suggestionsEl.style.left = rect.left + window.scrollX + "px";
    suggestionsEl.style.width = rect.width + "px";
  }

  let acIndex = -1;
  state.acDebounce = null;

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
                  data-value="${escapeHtml(name)}"
                  data-plz="${escapeHtml(plz)}"
                  style="cursor:pointer;font-size:.9rem;">
                <span class="fw-semibold">${escapeHtml(name)}</span>${detail ? `<small class="text-muted ms-2">${escapeHtml(detail)}</small>` : ""}
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
    clearTimeout(state.acDebounce);
    // F-44: eigener Token je Input-Event – nur die aktuellste Autocomplete-
    // Antwort darf die Suggestions zeigen.
    const acToken = ++state.acToken;
    const q = ortInput.value.trim();
    if (q.length < 2) {
      hideSuggestions();
      return;
    }
    state.acDebounce = setTimeout(async () => {
      try {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=7&lang=de&bbox=5.86,47.27,15.04,55.06`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        if (state.disposed) return;
        if (acToken !== state.acToken) {
          // F-44: veraltetes Ergebnis – keine Suggestions mehr zeigen
          hideSuggestions();
          return;
        }
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

  // Neupositionieren bei Größenveränderung / Scrollen — Listener-Referenzen
  // im Instanz-State ablegen (Task 9.2 / F-43 entfernt sie im Teardown).
  const resizeListener = () => {
    if (suggestionsEl.style.display !== "none") positionSuggestions();
  };
  const scrollListener = () => {
    if (suggestionsEl.style.display !== "none") positionSuggestions();
  };
  window.addEventListener("resize", resizeListener);
  window.addEventListener("scroll", scrollListener, true);
  state.listeners.push([window, "resize", resizeListener, false]);
  state.listeners.push([window, "scroll", scrollListener, true]);

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
function addToHead() {
  return ``;
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeHttpUrl(value) {
  const s = String(value || "").trim();
  return /^https?:\/\//i.test(s) ? s : "";
}


  /* ── Schale 4: KPI Kontext ── */
  function kpiContext(kontext, id, uid) {
    var text = String(kontext || "").trim();
    if (!text) return "";
    var targetId = "ls-kpi-kontext-" + id + "-" + uid;
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
  function renderMethodikbox(cfg, uid) {
    var hinweis = ((cfg && cfg.datenquelleHinweis) || "").trim();
    var stand = ((cfg && cfg.datenStand) || "").trim();
    if (!hinweis && !stand) return "";
    var standHtml = stand
      ? '<p class="text-muted small mb-2">' + escapeHtml(stand) + "</p>"
      : "";
    return (
      '<section class="ls-methodik mt-3">' +
      '<button class="ls-methodik-toggle collapsed" type="button" ' +
      'data-bs-toggle="collapse" data-bs-target="#ls-methodik-body-' + uid + '" ' +
      'aria-expanded="false" aria-controls="ls-methodik-body-' + uid + '">' +
      '<h2 class="h5 mb-0">Methodik &amp; Datenquelle</h2>' +
      '<span class="ls-methodik-chevron" aria-hidden="true">&#9662;</span>' +
      "</button>" +
      '<div id="ls-methodik-body-' + uid + '" class="collapse">' +
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
