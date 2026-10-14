# Changelog

## 1.29.9 - 2026-10-13
- FIX: Schnelllader werden wieder erkannt: das Ladesäulenregister schreibt das Feld `art_der_ladeeinrichung` (sic); die App liest jetzt beide Schreibweisen (vorher immer „Normal“).
- FIX: CKAN-Quellen über `datastore_search_sql` laden alle Seiten statt nur der ersten 100 Zeilen (die SQL-Antwort enthält kein `result.total`; es wird bis zur ersten kurzen Seite weitergeblättert).
- ENH: Datenvertrag beschreibt das Feld in der Schreibweise der Quelle.

## 1.29.8 - 2026-10-13
- FIX: Standard-Fehleranzeige gibt präzisere Tipps: ein „Failed to fetch“ ohne Proxy-Kontext erhält einen Netzwerk-Hinweis statt `proxyAktiv`; der 404-Hinweis gilt nur noch für echte HTTP-404-Antworten und nennt den lokal fehlenden Proxy/Relay statt pauschal „Datensatz auf dem Portal nicht gefunden“.

## 1.29.7 - 2026-10-13
- PERF: R2-005: Stationstabelle zeigt zunächst 200 Zeilen, weitere per „Weitere anzeigen“; Kennzahlen, Karte, Steckerfilter und Export beziehen sich weiter auf alle Stationen. Ein delegierter Zeilen-Listener. Filter-Reset bei 1.000 Stationen ca. 95 → 48 ms, bei 5.000 ca. 400 → 130 ms.

## 1.29.6 - 2026-10-13
- ENH: Datenvertrag `assets/datenvertraege.json` für die Store-Datenprüfung (`daten.pruefung`): die ODS-v2.1-Quelle `ladesaeulen` wird seitenweise wie in der App (`limit=100`/`offset`, ohne App-Obergrenze) mit Frictionless gegen das Rohdatenschema `assets/schemas/stationen.json` geprüft; `ort` und `postleitzahl` müssen vorhanden sein (serverseitiger Suchfilter), alle übrigen Felder sind wie in der App optional, Koordinaten über `/koordinaten/lat|lon`. Testfälle unter `tests/datenvertrag/`.

## 1.29.5 - 2026-10-02
- ENH: Verwendete ODAS-Dienste in `odas-services` deklariert.

## 1.29.4 - 2026-09-29

- **FIX:** Audit F-118: `initMap` nutzte die Variable `lsUid` statt des gleichnamigen Parameters — die App brach beim Start mit „lsUid is not defined" ab. Parameternamen und alle vier Verwendungen (u. a. KPI-Kontexte, Ort-Suggest) konsolidiert; Start, Suche, Karte und Trefferliste wieder funktionsfähig (Browser nachgewiesen).

## 1.29.3 - 2026-09-10
- **FIX:** Same-Page-Re-Render räumt Vorgänger-Instanz ab (LS-B1, extrahierter `teardownLadesaeulenInstanz` für Hook + Re-Render).
- **FIX:** Typ-Gate lässt CKAN-Tabellen zu (LS-B2, `erwarteteTypen`); vorhandener CKAN-Pfad war sonst unerreichbar.
- **FIX:** Vendor-Ladefehler mit `onerror` + Fehlerrender statt ewigem Laden (LS-B3); toter Code (`isLeerErgebnis`) entfernt, `addToHead` gibt `""` zurück (LS-B5).
- **FIX:** Methodik/Weiteres stehen statisch im App-Template statt pro Suche neu (LS-B4, Boxen bleiben offen).
- **ROBUST:** Ausreißer-Geocoding parallel/begrenzt (25) mit 8-s-Timeout, Entfernte gezählt (F-73); Datenstand pro Dataset gecacht; alle `ls-*`-IDs instanz-scoped.
- **FEATURE:** Nähe-Suche (Geolocation → Photon-Reverse → PLZ/Ort, nur auf Klick; Offenlegung in Beschreibung ergänzt); CSV-Export der Stationen (BOM).

## 1.29.2 - 2026-09-08
- **FIX:** Variante-A-Verdrahtung (F-92): Typprüfung (ods21) vor dem ersten Fetch; Quellen- und Ladefehler über `renderOdasFehler` (1.29.1 -> 1.29.2).

## 1.29.1 - 2026-09-07
- **FIX:** Frictionless-Härtung: `assets/schema.json` mit Titeln, echten Typen (`number`/`object`) und Fachbeschreibungen; `daten.beispiel`/`beispiel-url` befüllt. Records-Default bleibt (4B-Präzedenz): ODS-Hülle ist per Store-Validator nicht grün validierbar (`missing data table`), dokumentierte Ausnahme.

## 1.29.0 - 2026-08-25
- **CHG:** Proxy-Aufruf sendet die vollständige Ziel-URL statt nur Pfad+Query, damit die neue Origin-Allowlist-Prüfung der ODAS-Plattform greift (bisher implizite Auflösung gegen den ersten konfigurierten `apiurl`).
- **FIX:** Tote Anbieter-Shortcodes in Kontakt/Impressum ersetzt (`{{odp.anbieter.url-extern}}` → `{{odp.anbieter.url}}`, `tel:{{odp.anbieter.telcode}}` → `tel:{{odp.anbieter.tel}}`).


## 1.28.0 - 2026-08-22
- **CHG:** `version` in `app-package.json` zu `app-version` umbenannt.
- **ENH:** Top-Level-Feld `app-package-version` ergänzt (Wert `"2"`: mehrere benannte API-URLs über `instanz-config.apiurls`).

## 1.27.0 - 2026-08-21
- **CHG:** Skalares `apiurl` durch das Array-Feld `apiurls` ersetzt (`typ: "array"`, Eintrag `ladesaeulen`). Neuer Standard portfolioweit; `apiurl` entfällt. `app.js` liest die Datenquelle jetzt über `getOdasApiUrl(configdata, "ladesaeulen")`.

## 1.26.0 - 2026-08-20
- Markdown-Metadaten: Paketbeschreibungen auf echtes Markdown umgestellt, exakte Identität Top-Level/Instanz hergestellt, lokale HTML-Fixture semantisch gespiegelt.

## 1.25.0 - 2026-08-20
- FIX: Drei-Datenzustände-Kontrakt umgesetzt — unkonfigurierte `apiurl` zeigt `alert-info` statt `alert-danger`; 0 Ladestationen zeigen `alert-info` statt `alert-warning` (F-69)
- FIX: Der OpenDataSoft-Suchpfad escapte `postleitzahl`/`ort`-Sucheingaben bislang nicht, obwohl derselbe Datei-Code es im parallelen CKAN-Pfad bereits korrekt tat — jetzt konsequent über `escapeSqlString()` (F-77, Rest der bereits als geschlossen dokumentierten Welle AA, war im Arbeitsbaum nie committet)

## 1.24.0 - 2026-08-20
- FIX: Ladestationen ohne gültige Koordinaten fielen bisher komplett aus Karte UND Tabelle/KPIs — bleiben jetzt in der Tabelle sichtbar, fehlen nur auf der Karte; Anzahl wird als Hinweis angezeigt (F-73)

## 1.23.0 - 2026-08-17
- `fetchOdasJson()` wirft jetzt bei nicht-JSON-Antworten (CSV, HTML, leerer Body) eine sprechende Konfigurationsfehlermeldung statt der rohen `JSON.parse`-Parserfehlermeldung (F-66)
- `urlDaten` zeigte auf einen nicht mehr existierenden Host (`offenedaten.esslingen.de`/`open-data-esslingen.de`, NXDOMAIN) bzw. auf den Platzhalter `.../testdaten` (HTTP 404) — jetzt auf die reale Datensatz-Landingpage der tatsächlich konfigurierten `apiurl`-Quelle verweisend, live per HTTP-Abruf verifiziert (F-67)

## 1.22.0 - 2026-08-17
- **CHG:** `instanz-config`-`category`-Vokabular auf Deutsch umgestellt (`allgemein`, `beschreibung`, `datenherkunft`, `kontakt-rechtliches`, `sonstiges`); die entfallenen Kategorien `metrics` und `advanced` wurden auf `beschreibung` bzw. `sonstiges` verteilt

## 1.21.0 - 2026-08-12
- FIX: `app/index.html` auf den Template-Stand (F-47): Datei byte-gleich aus `oda-generic` übernommen — gültiges HTML, deutsche ARIA-Labels, Footer im Body; Titel und Fußzeile bleiben Platzhalter und werden zur Laufzeit aus der Instanz-Config überschrieben

## 1.20.0 - 2026-08-11
- FIX: Der Vollbild-Resize-Timeout wird pro Instanz gespeichert, beim Seitenwechsel abgeräumt und führt nach dem Teardown keine Leaflet-Operation mehr aus (F-43-Nachtrag)

## 1.19.0 - 2026-08-11
- FIX: Veraltete Antworten verwerfen (F-44): `fetchStationen` startet jeden Abruf mit monotonem Token (`state.fetchToken`) und prüft nach jeder await-Grenze vor jeder Zuweisung (`alleStationenRaw`, `geladenerOrt`, `geladenerSuchWert`, `applySteckerFilter`, Karte/Liste, Ladeanzeige); das `fixOutliers`-Ergebnis wird nur bei aktuellem Token angewendet; Autocomplete erhält pro Input-Event einen eigenen Token (`state.acToken`) und verwirft veraltete Photon-Antworten; `onPageLeave` invalidiert beide Token

## 1.18.0 - 2026-08-11
- FIX: Laufzeitressourcen beim Seitenwechsel freigeben (F-43): neuer `onPageLeave`-Hook setzt `disposed`, entfernt die dokument-/window-weiten Listener aus `state.listeners`, löscht das Suggestions-Element aus dem DOM, cleart den Autocomplete-Debounce (`acDebounce` liegt jetzt im State) und entfernt die Leaflet-Karte (`state.map`)

## 1.17.0 - 2026-08-11
- FIX: Laufzeitzustand pro App-Instanz isoliert (F-42): neuer pro-Instanz-State `state = { uid, root, config, listeners }` (zusammengeführt aus `lsUid`, `root`, `configdata`); Suggestions-`<ul>` wird in den App-Root gehängt statt an `document.body`, ID instanzeindeutig `ort-suggestions-<uid>` (Positionierung bleibt viewport-basiert); die dokument-/window-weiten Listener (keydown-Escape, resize, scroll) liegen als `[el, type, fn, capture]`-Referenzen in `state.listeners` — Task 9.2 (F-43) entfernt sie im onPageLeave-Teardown

## 1.16.0 - 2026-08-11
- FIX: XSS- und URL-Vertrag geschlossen; Photon offengelegt (F-35, F-36)

## 1.15.0 - 2026-08-07
- FIX: Bootstrap-Ziele instanzeindeutig machen (F-32)

## 1.14.0 - 2026-08-06
- FIX: DOM-Zugriffe auf den App-Container gescopt; Karten-ID mit App-Praefix versehen (F-25)

## 1.13.0 - 2026-08-06
- FIX: Datenschutzangabe beschreibt den tatsaechlichen Stand nach dem Vendoring (Welle G)

## 1.12.0 - 2026-08-06
- FIX: Drittanbietersektion nennt keine Beim-Aufruf-Behauptung mehr (Welle G)

## 1.11.0 - 2026-08-06
- FIX: Drittanbieterliste "Beim Aufruf kontaktierte Drittanbieter" an das Vendoring angepasst — jetzt lokal ausgelieferte Bibliotheken (Leaflet MarkerCluster) sind aus der Liste entfernt, weiterhin extern geladene Dienste (Kartenkacheln, Google-Maps-Link) bleiben genannt

## 1.10.0 - 2026-08-06
- FIX: Leaflet MarkerCluster vendored in `app/vendor/` statt von CDN geladen (Vendoring Teil 3) — Standalone-Betrieb laedt die Zusatzbibliotheken nicht mehr extern

## 1.9.0 - 2026-08-06
- FIX: Base auf Template oda-generic 1.6.0 vereinheitlicht (Hook renderPageOverride)

## 1.8.0 - 2026-08-04
- FIX: Datenschutzhinweis "Beim Aufruf kontaktierte Drittanbieter" an das Vendoring angepasst — jetzt lokal ausgelieferte Bibliotheken (Bootstrap/Leaflet/Chart.js) sind aus der Liste entfernt, weiterhin extern geladene Dienste (Kartenkacheln, Zusatzbibliotheken) bleiben genannt

## 1.7.0 - 2026-08-04
- FIX: Bootstrap, Leaflet vendored in `app/vendor/` statt von CDN geladen (F-07 Teil 2) — Standalone-Betrieb laedt diese Bibliotheken nicht mehr extern

## 1.6.0 - 2026-08-04
- FIX: Drittanbieter (CDN, Kartendienste) in `datenschutz`-Default und README dokumentiert (F-07 Teil 1)
- FIX: Bootstrap CSS/JS auf einheitlich 5.3.8 gezogen (vorher gemischt 5.3.0/5.3.1 bzw. 5.3.0/5.3.0) (F-31)

## 1.5.0 - 2026-07-31
- FIX: Quelldaten und string-Config-Werte werden vor der HTML-Ausgabe maskiert (F-08)
- CHG: toter Konfigurationsschlüssel lizenz entfernt (F-17)
- CHG: brandingCSS und brandingCSSFile als Base-Abhängigkeiten deklariert und lokal gespiegelt (F-17)
- CHG: format.typ von "String" auf v1-sicheres "string" korrigiert (F-18)
- CHG: dropdown-Default auf Feldebene verschoben statt in format (F-18)
- FIX: defekte Icon- und Screenshot-Referenzen korrigiert (F-19)
- CHG: daten.schema auf assets/schema.json gesetzt (F-20)

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
