**Internal network security monitoring platform — ACEDA Corp**

> ⚠️ This is an internal tool for ACEDA's security operations team. Not for external distribution.

## Architecture

- **Frontend**: React 19 + Vite + TailwindCSS v4 + Leaflet (Threat Map)
- **Backend**: Python FastAPI + SQLite + APScheduler
- **Agent**: eBPF-based network monitor (Linux only)
- **Threat Intel**: OTX, ThreatFox, AbuseIPDB integration

## Modules

| Module | Description |
|--------|-------------|
| Dashboard | System overview with real-time threat map widget |
| Threat Map | Full-screen global attack visualization |
| Rules | Sigma-like YAML detection rules with dry-run |
| Logs | Audit log viewer with CSV export |
| Settings | API key management and system configuration |
| Incidents | SOAR-lite incident response with approval workflow |

## Quick Start

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

```bash
cd frontend
npm install
npm run dev
```

## Credentials

Default admin account: `tahnadmin`

## Technical Notes

- Engine codename: "Aegis SOC Engine" (internal reference only)
- Detection rules stored in `backend/data/rules/*.yml`
- GeoIP database auto-downloaded on first startup
