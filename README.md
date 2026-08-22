# ACE Cyber Security (ACS)

**Internal network security monitoring platform — ACEDA Corp**

> ⚠️ This is an internal tool for ACEDA's security operations team. Not for external distribution.

## Architecture

- **Frontend**: React 19 + Vite + TailwindCSS v4 + Leaflet (Threat Map)
- **Backend**: Python FastAPI + SQLite + APScheduler
- **Agent**: eBPF-based network monitor (Linux only)
- **Threat Intel**: OTX, ThreatFox, AbuseIPDB integration
- **AI Engine**: Local Ollama (llama3:8b) with Gemini fallback

## Modules

| Module | Description |
|--------|-------------|
| Dashboard | System overview with real-time threat map widget |
| Infrastructure | Live Proxmox resource dashboard (disk/CPU/RAM/bandwidth gauges, storage pools, SOC signals) + VM/LXC control |
| Threat Map | Full-screen global attack visualization |
| Assets | Asset Inventory (Server tracking) |
| Incidents | SOAR-lite incident response with Kanban workflow |
| Rules | Sigma-like YAML detection rules |
| Logs | Audit log viewer |
| Settings | API key and AI Provider management |

## Data Sources
- **Local Sensor**: eBPF Agent monitoring real traffic.
- **Global Intel**: Daily fetch from OTX/ThreatFox.
*(Note: Visual simulator has been completely removed for production safety).*

## Deployment

Please refer to [DEPLOYMENT.md](DEPLOYMENT.md) for full instructions on deploying to Proxmox VE via Docker Compose.

## Credentials

Default admin account: `tahnadmin`
