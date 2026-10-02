# Abschluss-Challenge – Fehleranalyse

Die sechs Fehler entsprechen der Challenge aus dem Projektauftrag.

| # | Symptom / Risiko | Ursache | Fix |
|---|---|---|---|
| 1 | Python wird als 3.1 interpretiert bzw. Setup schlägt fehl | `python-version: 3.10` ohne String-Behandlung | Version als String (`"3.10"`) oder Workflow-Variable verwenden |
| 2 | `pytest: command not found` | Tests laufen vor der Installation der Dependencies | Erst `pip install`, danach `python -m pytest` |
| 3 | `requirements`-Datei wird nicht gefunden | Falscher Dateiname `requirement.txt` | `requirements.txt` verwenden |
| 4 | Build findet `src/` nicht und ist nicht an Tests gekoppelt | Checkout und `needs: test` fehlen | Repository im Job auschecken und Build an grüne Tests koppeln |
| 5 | Deployment läuft bei PRs und Secret landet im Log | `if`, Environment und sichere Secret-Nutzung fehlen | Auf `main` begrenzen, `environment: production`, Secret nicht ausgeben |
| 6 | Cache bleibt trotz geänderter Dependencies gleich | Statischer Cache-Key | `runner.os` und `hashFiles(...)` in den Key aufnehmen |
