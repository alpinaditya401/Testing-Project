# AquaSmart backend

Backend PHP 8, SQLite, and the legacy document root used for compatibility. The
Next.js frontend and its BFF are in `../frontend/`.

## Run locally

From this directory:

```powershell
python server/run_local.py --single-pond
```

The API health endpoint is `http://127.0.0.1:8080/api/health`. The launcher
creates local credentials and a SQLite database under `server/data/`.

## Verify

```powershell
python server/tests/run_verified_suite.py
```

## Railway

Set the Railway service root directory to `backend/`. Its `railway.json` uses
`deploy/Dockerfile` and checks `/api/health` after deployment. Keep the Railway
volume mounted at `/data` so SQLite data survives container replacements.
