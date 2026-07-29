#!/bin/bash
set -e

echo "======================================"
echo "    ACS Production Deployment Script  "
echo "======================================"

# 1. Check if .env exists
if [ ! -f backend/.env ]; then
    echo "[!] backend/.env not found! Copying from backend/.env.example..."
    cp backend/.env.example backend/.env
    echo "[-] PLEASE EDIT backend/.env with your real API keys before continuing!"
    exit 1
fi

# 2. Generate Self-Signed Certificate if it doesn't exist
SSL_DIR="nginx/ssl"
CERT_FILE="$SSL_DIR/cert.pem"
KEY_FILE="$SSL_DIR/key.pem"

mkdir -p $SSL_DIR

if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    echo "[+] Generating self-signed TLS certificates for internal use..."
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout "$KEY_FILE" -out "$CERT_FILE" \
        -subj "/C=VN/ST=HCM/L=HCM/O=ACEDA/OU=SOC/CN=soc.local"
    echo "[+] TLS Certificates generated successfully."
else
    echo "[+] TLS Certificates already exist. Skipping."
fi

# 3. Stop running containers if any
echo "[+] Stopping any running containers..."
docker compose -f docker-compose.prod.yml down || true

# 4. Pull updates and build
echo "[+] Pulling latest updates from Github..."
git pull origin main

echo "[+] Building and starting ACS Production Stack..."
docker compose -f docker-compose.prod.yml up -d --build

echo "======================================"
echo " Deployment Successful! "
echo " ACS is now running at https://localhost (or your server's IP)."
echo " Note: Your browser will show a warning because this is a self-signed cert."
echo " Accept the risk and proceed to the login page."
echo " To view logs: docker compose -f docker-compose.prod.yml logs -f"
echo "======================================"
