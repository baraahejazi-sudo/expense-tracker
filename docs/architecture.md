# Pipeline-Architektur

| Job | Zweck | Trigger / Bedingung | `needs` | Environment | Artifact |
|---|---|---|---|---|---|
| `backend-test` | FastAPI-Abhängigkeiten installieren und `pytest` ausführen | Push/PR auf `main` | – | – | – |
| `frontend-test` | React-Abhängigkeiten installieren und Vitest ausführen | Push/PR auf `main` | – | – | – |
| `build` | React Production Build erstellen und Release-ZIP paketieren | Nur nach grünen Backend- und Frontend-Tests | `backend-test`, `frontend-test` | – | Upload `expense-tracker-release` |
| `deploy` | Artifact herunterladen und GitHub Release erzeugen | Nur `push` auf `main` | `build` | `production` | Download `expense-tracker-release` |

## Datenfluss

```text
Pull Request / Push
        |
        +-------------------+
        |                   |
        v                   v
 backend-test         frontend-test
        |                   |
        +---------+---------+
                  |
                  v
                build
                  |
          release artifact
                  |
                  v
        production environment
                  |
                  v
                deploy
                  |
                  v
           GitHub Release
```

## Sicherheitsentscheidungen

- Standardmäßig `permissions: contents: read`.
- Nur der Deployment-Job erhält `contents: write` und `actions: read`.
- `DEPLOY_TOKEN` wird als Secret eingelesen, aber niemals ausgegeben; im Log erscheint nur die Länge.
- Das `production` Environment soll in GitHub mit Required Reviewer und Deployment Branch `main` geschützt werden.
- Pull Requests können testen und bauen, aber nicht deployen.
- Der Deployment-Job verwendet exakt das zuvor erzeugte Artifact und baut nicht erneut.
