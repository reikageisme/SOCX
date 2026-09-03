from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "ACS Control Plane"
    API_V1_STR: str = "/api/v1"
    CORS_ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    
    # Proxmox VE Configuration
    PROXMOX_HOST: str = "127.0.0.1"
    PROXMOX_USER: str = "root@pam"
    PROXMOX_TOKEN_ID: str = "aegis"
    PROXMOX_TOKEN_SECRET: str = "your-token-secret-here"
    PROXMOX_VERIFY_SSL: bool = False

    # Infrastructure dashboard (trang Infrastructure / cPanel-style)
    NET_LINK_MBPS: int = 1000          # Bang thong uplink gia dinh cho moi node (Mbps)
    INFRA_WARN_PERCENT: float = 80.0   # Nguong canh bao vang
    INFRA_CRIT_PERCENT: float = 90.0   # Nguong canh bao do
    INFRA_POLL_SECONDS: int = 5        # Chu ky poll + broadcast WebSocket

    # Security / JWT
    SECRET_KEY: str = "a-very-secret-key-change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440 # 24 hours

    # Docker hosts reachable from the SOC.
    # Local daemon is always present; remote LXC containers are reached over SSH:
    #   DOCKER_HOSTS=ct-101=ssh://root@192.168.1.101,ct-103=ssh://root@192.168.1.103
    DOCKER_HOSTS: str = ""
    DOCKER_LOCAL_NAME: str = "local"
    DOCKER_TIMEOUT: int = 15          # seconds per Docker API call
    DOCKER_SSH_USE_CLI: bool = False  # True = shell out to the ssh binary instead of paramiko
    # Each remote log read opens its own SSH channel; sshd allows MaxSessions (10
    # by default), so stay well under it or the daemon rejects new channels.
    DOCKER_SSH_CONCURRENCY: int = 2
    DOCKER_LOCAL_CONCURRENCY: int = 8

    # Mock mode for local testing without real Proxmox
    MOCK_PROXMOX: bool = False
    INTERNAL_API_KEY: str = "aegis-dev-key"

    # API Keys
    OTX_API_KEY: str = ""
    THREATFOX_API_KEY: str = ""
    ABUSEIPDB_API_KEY: str = ""
    MAXMIND_LICENSE_KEY: str = ""

    # AI Configuration
    AI_PROVIDER: str = "ollama"
    OLLAMA_URL: str = "http://localhost:11434"
    GEMINI_API_KEY: str = ""

    class Config:
        env_file = ".env"

settings = Settings()
