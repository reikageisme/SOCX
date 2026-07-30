# ACE Cyber Security (ACS) - Project Context

**Overview**: Internal network security monitoring platform for ACEDA Corp. (Do not distribute externally).

## Architecture & Tech Stack
- **Frontend**: React 19 + Vite + TailwindCSS v4 + Leaflet (Threat Map). Code is in `frontend/`.
- **Backend**: Python FastAPI + SQLite (`aegis.db`) + APScheduler. Code is in `backend/app/`. Dependencies managed via `requirements.txt`.
- **Agent**: eBPF-based network monitor (Linux only). Code is in `agent/`.
- **Threat Intel**: Integrations with OTX, ThreatFox, and AbuseIPDB.
- **AI Engine**: Local Ollama (llama3:8b) with Gemini fallback.
- **Deployment**: Proxmox VE via Docker Compose (`docker-compose.yml`, `docker-compose.prod.yml`). Reverse proxy handled by `nginx/`.

## Key Modules
- **Dashboard**: System overview with real-time threat map widget.
- **Threat Map**: Full-screen global attack visualization.
- **Assets**: Asset Inventory (Server tracking).
- **Incidents**: SOAR-lite incident response with Kanban workflow.
- **Rules**: Sigma-like YAML detection rules.
- **Logs**: Audit log viewer.
- **Settings**: API key and AI Provider management.

## General Guidelines
- Respect the internal, confidential nature of the platform.
- When adding dependencies or features, ensure they align with the local/on-premise deployment model (e.g., local AI, SQLite).
- Check `DEPLOYMENT.md` for any changes related to production deployment.
- **Workflow Rule**: Always commit and push changes to GitHub (`origin main`) after successfully completing a batch of tasks.
