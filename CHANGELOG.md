# Changelog

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
