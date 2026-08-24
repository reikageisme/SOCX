#!/bin/bash
# Cai Aegis sensor agent len Proxmox host.
#
#   bash install-sensor-agent.sh https://192.168.1.50 aegis-dev-key
#
# Tham so 1: dia chi SOC (CT chay backend)
# Tham so 2: INTERNAL_API_KEY, phai trung voi backend/.env
set -e

URL="${1:-}"
KEY="${2:-aegis-dev-key}"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -z "$URL" ]; then
    echo "Thieu dia chi SOC."
    echo "Vi du: bash install-sensor-agent.sh https://192.168.1.50 aegis-dev-key"
    exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
    echo "Phai chay bang root tren Proxmox host."
    exit 1
fi

echo "[1/5] Cai goi phu thuoc..."
apt-get update -qq
apt-get install -y -qq lm-sensors smartmontools >/dev/null

echo "[2/5] Do cam bien (sensors-detect)..."
sensors-detect --auto >/dev/null 2>&1 || true
modprobe drivetemp 2>/dev/null || true

echo "[3/5] Chep agent..."
install -m 0755 "$SRC_DIR/aegis_sensor_agent.py" /usr/local/bin/aegis-sensor-agent.py
install -m 0644 "$SRC_DIR/aegis-sensor-agent.service" /etc/systemd/system/aegis-sensor-agent.service
mkdir -p /var/lib/aegis-sensor-agent

echo "[4/5] Ghi cau hinh..."
cat > /etc/default/aegis-sensor-agent <<CONF
AEGIS_URL=$URL
AEGIS_API_KEY=$KEY
AEGIS_INTERVAL=5
CONF
chmod 600 /etc/default/aegis-sensor-agent

echo "[5/5] Khoi dong dich vu..."
systemctl daemon-reload
systemctl enable --now aegis-sensor-agent
sleep 3
systemctl --no-pager status aegis-sensor-agent | head -15

echo
echo "Xong. Xem log truc tiep: journalctl -u aegis-sensor-agent -f"
echo "Kiem tra kha nang dieu khien quat:"
python3 /usr/local/bin/aegis-sensor-agent.py --once --dry-run 2>/dev/null | head -3
