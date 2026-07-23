# E-Ladesäulen Karte – App für den Open Data App-Store (ODAS)

Interaktive Karte und Tabelle aller E-Ladesäulen in Deutschland für den [Open Data App Store](https://open-data-app-store.de/). Entspricht der [Open Data App-Spezifikation](https://open-data-apps.github.io/open-data-app-docs/open-data-app-spezifikation/). Mehr unter https://github.com/open-data-apps

Version 1.1.0 — mit Schale 4 Verständlichkeits-Komponenten (Datenfrische-Indikator, weiterführende Links).

---

## Screenshots

### Desktop

![Desktop-Ansicht](assets/Desktop_Screenshot.png)

### Mobile

![Mobile-Ansicht](assets/Mobile_Screenshot.png)

---

## Funktionen

Single Page Application mit Logo, Menü, Impressum/Datenschutz/Kontakt-Seiten und Fußzeile. Die Konfiguration wird vom ODAS geladen. Inhalte:

- **Suche** nach Stadt oder PLZ mit Autocomplete (Photon/Komoot-Geocoding)
- **Steckertyp-Filter**: CCS (DC Combo), CHAdeMO, AC Typ 2, AC Schuko – clientseitig ohne erneute API-Anfrage
- **Interaktive Karte**: Leaflet.js/OpenStreetMap mit Marker-Clustering, farbkodierten Icons (Schnell-/Normallader), Vollbild-Modus
- **Popup-Details** je Station: Betreiber, Adresse, Typ, Ladepunkte, Leistung, Stecker, Inbetriebnahmedatum, Google-Maps-Link
- **Kennzahlen**: Anzahl Ladesäulen, Gesamtzahl Ladepunkte, maximale Leistung
- **Sortierbare Tabelle**: Klick auf Tabellenzeile zentriert die Karte auf die Station
- **Koordinaten-Korrektur**: Geografische Ausreißer werden per Photon-Geocoding nachgeodet
- **Datenfrische-Indikator**: Zeigt das letzte Aktualisierungsdatum des Datensatzes an
- **Weiterführende Links**: Konfigurierbare Verweise zu verwandten Quellen (z. B. Bundesnetzagentur-Ladesäulenregister)

---

## Für wen ist diese App?

Diese App zeigt öffentliche Ladesäulen in Deutschland. Sie richtet sich an E-Auto-Fahrende, die unterwegs eine passende Ladestation suchen — filterbar nach Steckertyp und Umkreis. Es sind keine Datenfachkenntnisse erforderlich.

---

## Datenquelle

**Bundesnetzagentur** via Open Data Rhein-Kreis-Neuss:

- Datensatz: `rhein-kreis-neuss-ladesaulen-in-deutschland` (~61.793 Einträge)
- API-Endpunkt: `https://opendata.rhein-kreis-neuss.de/api/explore/v2.1/catalog/datasets/rhein-kreis-neuss-ladesaulen-in-deutschland/records`
- Lizenz: CC BY 4.0

---

## Entwicklung

**Voraussetzungen:** Docker / Docker Compose, Make

```bash
make build up
```

App läuft auf http://localhost:8089 (Konfiguration wird lokal geladen).

### Wichtige Dateien

| Datei                     | Beschreibung                                                                      |
| ------------------------- | --------------------------------------------------------------------------------- |
| `app/app.js`              | Hauptlogik: Datenladen (paginiert), Geocoding, Leaflet-Karte, Clustering, Tabelle |
| `app/app.css`             | App-spezifische Styles                                                            |
| `app-package.json`        | App-Metadaten und Instanz-Konfigurationsfelder für den ODAS                       |
| `odas-config/config.json` | Lokale Konfiguration für die Entwicklung                                          |
| `assets/branding.css`     | Branding/Theme-Styles                                                             |

---

## Konfiguration (Instanz)

| Parameter     | Beschreibung                                 | Pflicht |
| ------------- | -------------------------------------------- | ------- |
| `apiurl`      | URL zum API-Endpunkt der Ladesäulen-Daten    | ja      |
| `titel`       | Anzeigetitel der App                         | ja      |
| `seitentitel` | Browser-Tab-Titel                            | ja      |
| `urlDaten`    | URL zur Katalog-Seite des Datensatzes im ODP | ja      |

---

## Betriebsarten

Die App kann lokal, eigenstaendig hinter einem Traefik-Reverse-Proxy oder ueber den ODAS
betrieben werden.

### Datenabruf: `proxyAktiv`

| Wert   | Bedeutung                                                                   |
| ------ | --------------------------------------------------------------------------- |
| `nein` | Direkter Abruf der Daten-URL. Standard fuer Entwicklung und Standalone.      |
| `ja`   | Abruf ueber den ODAS-Proxy `…/odp-data`. Nur im ODAS-Live-System verfuegbar. |

Bei `nein` muss die Datenquelle CORS freigeben.

### Standalone-Betrieb

Voraussetzung: ein laufender Traefik mit dem externen Docker-Netzwerk `proxynet`,
dem EntryPoint `websecure` und dem Zertifikatsresolver `letsencrypt`.

1. In `docker-compose.standalone.yml` den Platzhalter `app1.example.com` durch den
   echten FQDN ersetzen.
2. In `odas-config/config.json` `proxyAktiv` auf `nein` belassen.
3. Starten:

```bash
STANDALONE=true make up
STANDALONE=true make logs
STANDALONE=true make down
```

Im Standalone-Betrieb entfaellt die lokale Portfreigabe; Traefik terminiert TLS und
leitet auf den internen Nginx-Port 80 weiter. Die Konfiguration wird aus derselben
`odas-config/config.json` gelesen wie in der Entwicklung und von Nginx unter `/config`
ausgeliefert.

### Auslieferung an den ODAS

`make zip` erzeugt das Liefer-ZIP mit `app/`, `assets/`, `app-package.json` und
`CHANGELOG.md`. Die Infrastrukturdateien (`Dockerfile`, `docker-compose*.yml`,
`nginx.conf`, `Makefile`) sind nicht Teil der Auslieferung.

## Autor

© 2026, Ondics GmbH
