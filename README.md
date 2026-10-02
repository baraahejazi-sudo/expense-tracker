# Expense Tracker

Ein kleiner Full-Stack Expense Tracker mit **React + TypeScript** im Frontend und **FastAPI** im Backend. Die Anwendung verwaltet Einnahmen und Ausgaben, berechnet Monatskennzahlen und zeigt Ausgaben gruppiert nach Kategorien. Die Daten werden bewusst in einer lokalen JSON-Datei gespeichert, damit das Projekt ohne Datenbank oder externe Dienste ausgeführt werden kann.

## Funktionen

- Einnahmen und Ausgaben anlegen, bearbeiten und löschen
- Kategorien wie Wohnen, Lebensmittel, Transport, Freizeit und Gehalt
- Monatsfilter, Typfilter, Kategoriefilter und Volltextsuche
- Dashboard für Saldo, Einnahmen, Ausgaben und Anzahl der Transaktionen
- Ausgabenanalyse nach Kategorie
- Validierung im Frontend und Backend
- Persistenz in `backend/data/transactions.json`
- REST API mit automatisch generierter OpenAPI-Dokumentation
- Backend-Tests mit `pytest` und FastAPI `TestClient`
- Frontend-Tests mit Vitest und Testing Library
- CI/CD mit GitHub Actions, Build-Artifact, geschütztem Environment und automatischem GitHub Release

## Technologie

| Bereich | Technologie |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Backend | Python 3.13, FastAPI, Pydantic |
| Persistenz | JSON-Datei mit atomarem Schreiben |
| Backend Tests | pytest, pytest-cov, HTTPX/TestClient |
| Frontend Tests | Vitest, Testing Library, jsdom |
| CI/CD | GitHub Actions |
| Deployment | GitHub Release mit ZIP-Artifact |

## Projektstruktur

```text
expense-tracker/
├── .github/
│   └── workflows/
│       └── pipeline.yml
├── backend/
│   ├── app/
│   │   └── main.py
│   ├── data/
│   │   └── transactions.json
│   ├── tests/
│   │   └── test_api.py
│   ├── requirements.txt
│   └── requirements-dev.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── App.test.tsx
│   │   ├── main.tsx
│   │   └── styles.css
│   ├── package.json
│   └── vite.config.ts
├── docs/
│   ├── architecture.md
│   └── abschluss-challenge.md
└── README.md
```

## Lokal ausführen

### Voraussetzungen

- Python 3.10 oder neuer; für die Pipeline wird Python 3.13 verwendet
- Node.js 22
- npm

### 1. Backend starten

```bash
cd backend
python -m venv .venv
```

macOS / Linux:

```bash
source .venv/bin/activate
```

Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

Dependencies installieren und API starten:

```bash
python -m pip install -r requirements-dev.txt
python -m uvicorn app.main:app --reload
```

Danach:

- API: `http://localhost:8000`
- Swagger UI: `http://localhost:8000/docs`
- Health Check: `http://localhost:8000/api/health`

### 2. Frontend starten

In einem zweiten Terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:5173`

Standardmäßig kommuniziert das Frontend mit `http://localhost:8000/api`. Eine andere API kann über `VITE_API_BASE_URL` konfiguriert werden. Siehe `frontend/.env.example`.

## API

| Methode | Endpoint | Zweck |
|---|---|---|
| `GET` | `/api/health` | Health Check |
| `GET` | `/api/transactions` | Transaktionen laden und filtern |
| `POST` | `/api/transactions` | Transaktion erstellen |
| `PUT` | `/api/transactions/{id}` | Transaktion bearbeiten |
| `DELETE` | `/api/transactions/{id}` | Transaktion löschen |
| `GET` | `/api/summary` | Kennzahlen und Kategorieauswertung |

### Filter

Beispiele:

```text
GET /api/transactions?type=expense
GET /api/transactions?category=food
GET /api/transactions?month=2026-10
GET /api/transactions?search=Supermarkt
GET /api/summary?month=2026-10
```

### Beispiel für eine Transaktion

```json
{
  "title": "Wocheneinkauf",
  "amount": "86.45",
  "type": "expense",
  "category": "food",
  "date": "2026-10-02",
  "notes": "Supermarkt"
}
```

Geldbeträge werden im Backend mit `Decimal` verarbeitet und als Dezimalstrings übertragen, damit Berechnungen nicht von binären Gleitkomma-Rundungsfehlern abhängen.

## Tests

### Backend

```bash
cd backend
python -m pytest -v
```

Die Testkonfiguration verlangt mindestens 80 % Code Coverage.

### Frontend

```bash
cd frontend
npm test
```

### Production Build lokal prüfen

```bash
cd frontend
npm run build
```

Das React-Production-Bundle liegt anschließend unter `frontend/dist/`.

## Pipeline im Überblick

Der Workflow liegt unter `.github/workflows/pipeline.yml` und startet bei:

- `push` auf `main`
- `pull_request` gegen `main`

Pipeline:

```text
                   push / pull_request
                           |
              +------------+------------+
              |                         |
              v                         v
        backend-test              frontend-test
              |                         |
              +------------+------------+
                           |
                           v
                         build
                           |
                 expense-tracker-release
                         Artifact
                           |
                           v
              production Environment
                           |
                           v
                         deploy
                           |
                           v
                    GitHub Release
```

### Jobs

1. **backend-test**
   - Checkout
   - Python Setup
   - pip Cache mit `hashFiles(...)`
   - Dependencies installieren
   - `pytest` + Coverage

2. **frontend-test**
   - Checkout
   - Node.js Setup
   - `npm install`
   - Vitest

3. **build**
   - wartet auf beide Test-Jobs
   - erstellt den React Production Build
   - paketiert Frontend + FastAPI Backend als ZIP
   - lädt das ZIP als GitHub Actions Artifact hoch

4. **deploy**
   - wartet auf `build`
   - läuft nur bei einem `push` auf `main`
   - verwendet das GitHub Environment `production`
   - lädt exakt das zuvor erzeugte Artifact herunter
   - prüft die Verfügbarkeit von `DEPLOY_TOKEN`, ohne den Wert auszugeben
   - erzeugt automatisch ein GitHub Release

Die detaillierte Planung steht in [`docs/architecture.md`](docs/architecture.md).

## Secrets, Variables und Environment

Vor dem ersten Deployment müssen in GitHub folgende Einstellungen angelegt werden.

### Secret

`Settings -> Secrets and variables -> Actions -> Secrets`

```text
DEPLOY_TOKEN
```

Für das Lernprojekt reicht ein Fantasiewert. Der Workflow gibt niemals den Secret-Wert aus, sondern prüft nur, ob er vorhanden ist.

### Variable

`Settings -> Secrets and variables -> Actions -> Variables`

```text
DEPLOY_TARGET=github-release
```

### Environment

`Settings -> Environments -> New environment`

Name:

```text
production
```

Empfohlene Schutzregeln:

- Required reviewer aktivieren
- Deployment Branch auf `main` begrenzen

## Permissions

Global gilt:

```yaml
permissions:
  contents: read
```

Nur der Deployment-Job erweitert die Rechte auf:

```yaml
permissions:
  contents: write
  actions: read
```

Damit folgt der Workflow dem Least-Privilege-Prinzip.

## Deployment

In diesem Projekt bedeutet Deployment die Veröffentlichung eines reproduzierbaren Release-Pakets als **GitHub Release**.

Nach einem erfolgreichen Push auf `main`:

1. Backend- und Frontend-Tests laufen grün.
2. Der Build-Job erzeugt `expense-tracker-release.zip`.
3. Das ZIP wird als Artifact gespeichert.
4. Der Deployment-Job wartet auf die Regeln des `production` Environments.
5. Das Artifact wird heruntergeladen; es wird nicht erneut gebaut.
6. Ein Release mit einem Tag wie `v1.0.17` wird erzeugt.
7. `expense-tracker-release.zip` wird als Release Asset angehängt.

## Pull-Request-Verhalten

Bei einem Pull Request laufen Tests und Build. Der Deployment-Job wird wegen dieser Condition übersprungen:

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

Damit kann ein Pull Request niemals direkt ein Production Release veröffentlichen.

## Abschluss-Challenge

Die dokumentierte Fehleranalyse befindet sich unter [`docs/abschluss-challenge.md`](docs/abschluss-challenge.md).

## Definition of Done

- [x] GitHub Actions Workflow für `push` und `pull_request`
- [x] Mehrere Jobs mit unterschiedlichen Verantwortlichkeiten
- [x] Automatisierte Backend- und Frontend-Tests
- [x] Production Build
- [x] ZIP-Paket als Build-Ergebnis
- [x] Artifact Upload und Download in einem anderen Job
- [x] Cache-Key mit `hashFiles(...)`
- [x] Secret-Nutzung ohne Ausgabe des Secret-Werts
- [x] `production` Environment im Deployment-Job
- [x] eingeschränkte Permissions
- [x] `if`-Condition für Deployment
- [x] Deployment nur nach grünen Tests
- [x] automatisches GitHub Release mit ZIP-Asset
- [x] lokale Ausführung und Pipeline vollständig dokumentiert

## Lizenz

MIT

## Projektstatus

Das Projekt wurde als Full-Stack-CI/CD-Abschlussprojekt umgesetzt.
