# Changelog

## 1.4.0 - 2026-07-30

- **FIX:** Laufzeitfehler nach dem Laden der Konfiguration werden jetzt sichtbar gemeldet; `handleRouting()` wird `await`et und besitzt einen Fehlerpfad. Bisher blieb die Seite bei einem Fehler im Seitenaufbau stumm leer
- **FIX:** `getConfigUrl()` schneidet bei einer URL ohne abschliessenden Schraegstrich nicht mehr das letzte Verzeichnis ab; die Konfiguration wird auch unter `.../app` gefunden
- **FIX:** Klick auf einen Hash-Link, der bereits die aktive Seite bezeichnet, rendert die Seite neu (`setupSamePageLinks()`) - das Logo fuehrt damit aus Unteransichten zurueck zur Startseite
- **ENH:** `app/app-base.js` ist wieder byte-identisch zum Template `oda-generic` 1.4.0; app-spezifisches Aufraeumen laeuft ueber den neuen Hook `onPageLeave(page)` in `app/app.js`
- **FIX:** Der Pfad zur Branding-CSS wird jetzt relativ zum App-Verzeichnis aufgeloest (`../assets/branding.css`); bisher wurde die Datei beim lokalen Test unterhalb von `app/` gesucht und deshalb nicht gefunden

## 1.3.0 - 2026-07-24

- **FIX:** Laufzeit-Fehlermeldung wird vor der Anzeige HTML-maskiert (`escapeHtmlForBase`); ein Fehlertext kann kein Markup mehr in die Seite einschleusen (XSS)
- **FIX:** Startseiten-Renderer wird nun `await`et; bei asynchronen Apps erscheint kein kurzzeitiges `[object Promise]` in `#main-content`

## 1.2.0 - 2026-07-23

- **ENH:** Datenabruf auf den Schalter `proxyAktiv` umgestellt; direkte Abrufe sind der Standard, der ODAS-Proxy wird nur noch bei `ja` verwendet
- **ENH:** Einfachen Standalone-Betrieb hinter Traefik mit derselben `odas-config/config.json` wie in der Entwicklung ergänzt
- **ENH:** Traefik-Anbindung auf das externe Netzwerk `proxynet`, den EntryPoint `websecure` und den Zertifikatsresolver `letsencrypt` festgelegt
- **FIX:** Proxy-Basispfad funktioniert jetzt auch bei URLs mit `index.html`; der Ziel-Pfad wird URL-kodiert
- **DOC:** Start über `STANDALONE=true make up` dokumentiert

## 03.07.2026 (Version 1.1.0)

- ENH: Schale 4 – escapeHtml() für XSS-Schutz
- ENH: Schale 4 – renderWeitereInfos() für konfigurierbare weiterführende Links
- ENH: Schale 4 – Datenfrische-Indikator via ODS Catalog (metas.modified)
- ENH: Schale 4 – config: weiterfuehrendeLinks mit Bundesnetzagentur-Ladesäulenregister + ODS-Datensatz

## 05.03.2026 (Version 1.0.0)

- ENH: Interaktive Leaflet-Karte mit Marker-Clustering (Leaflet.markercluster)
- ENH: Stadt-/PLZ-Suche mit Photon-Autocomplete
- ENH: Steckertyp-Filter (CCS, CHAdeMO, AC Typ 2, AC Schuko) – clientseitig
- ENH: Paginiertes Laden aller API-Seiten (bis zu 61.793 Einträge)
- ENH: Koordinaten-Korrektur für geografische Ausreißer via Photon-Geocoding
- ENH: Popup je Station mit Betreiber, Adresse, Leistung, Stecker, Google-Maps-Link
- ENH: Sortierbare Tabelle mit Klick-to-Map-Funktion
- ENH: Vollbild-Modus für die Karte (inkl. Escape-Taste)
- ENH: Kennzahlen-Karten (Ladesäulen, Ladepunkte, Max-Leistung)
- ENH: Farbkodierte Icons: Schnelllader (rot) / Normallader (grün)
