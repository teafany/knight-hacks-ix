#!/usr/bin/env bash
# Enable static React hosting alongside the existing HTTPS API and CI releases.
set -euo pipefail
[[ $EUID -eq 0 && -n ${SUDO_USER:-} && $SUDO_USER != root ]] || {
    echo 'Run with sudo from the account that owns the checkout.' >&2; exit 1;
}
APP_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
DEPLOY_USER=$SUDO_USER
DEPLOY_GROUP=$(id -gn "$DEPLOY_USER")
USER_HOME=$(getent passwd "$DEPLOY_USER" | cut -d: -f6)
PUBLIC_IP=${1:?Usage: sudo bash deploy/enable-frontend.sh PUBLIC_IPV4_ADDRESS}
python3 - "$PUBLIC_IP" <<'PY'
import ipaddress
import sys
if not ipaddress.IPv4Address(sys.argv[1]).is_global:
    raise SystemExit('Use the server public IPv4 address.')
PY
PUBLIC_ROOT=/var/www/knight-hacks
ACTIVE=$(readlink -f "$USER_HOME/.local/share/knight-hacks/current")
test -f "$ACTIVE/frontend/package-lock.json"
test -f /etc/letsencrypt/live/knight-hacks-ip/fullchain.pem
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y nodejs npm
node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 12)) process.exit(1)'

runuser -u "$DEPLOY_USER" -- env VITE_API_BASE_URL=/api npm ci --prefix "$ACTIVE/frontend"
runuser -u "$DEPLOY_USER" -- env VITE_API_BASE_URL=/api npm --prefix "$ACTIVE/frontend" run build
test -f "$ACTIVE/frontend/dist/index.html"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" -m 0755 "$PUBLIC_ROOT" "$PUBLIC_ROOT/releases"
INITIAL="$PUBLIC_ROOT/releases/$(basename "$ACTIVE")"
runuser -u "$DEPLOY_USER" -- mkdir -p "$INITIAL"
runuser -u "$DEPLOY_USER" -- cp -a "$ACTIVE/frontend/dist/." "$INITIAL/"
chmod -R a+rX "$INITIAL"
runuser -u "$DEPLOY_USER" -- ln -sfn "$INITIAL" "$PUBLIC_ROOT/current"

SITE=/etc/nginx/sites-available/knight-hacks-api
if [[ ! -f $SITE.before-frontend ]]; then
    cp -p "$SITE" "$SITE.before-frontend"
fi
cat > "$SITE" <<EOF
server {
    listen 80;
    server_name $PUBLIC_IP;
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/knight-hacks-acme;
        default_type text/plain;
        try_files \$uri =404;
    }
    location / { return 308 https://$PUBLIC_IP\$request_uri; }
}

server {
    listen 443 ssl;
    server_name $PUBLIC_IP;
    ssl_certificate /etc/letsencrypt/live/knight-hacks-ip/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/knight-hacks-ip/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:KnightHacksSSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    client_max_body_size 10m;
    root $PUBLIC_ROOT/current;
    index index.html;

    location ^~ /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 180s;
    }
    location ^~ /static/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location /assets/ {
        try_files \$uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    location = /index.html {
        add_header Cache-Control "no-cache";
    }
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
nginx -t
install -o root -g root -m 0755 "$APP_DIR/deploy/redeploy.sh" /usr/local/libexec/knight-hacks-redeploy
systemctl reload nginx
curl --fail --silent --show-error --resolve "$PUBLIC_IP:443:127.0.0.1" \
    "https://$PUBLIC_IP/" | grep -q 'id="root"'
curl --fail --silent --show-error --resolve "$PUBLIC_IP:443:127.0.0.1" \
    "https://$PUBLIC_IP/api/health"
echo
echo "Frontend hosting ready: https://$PUBLIC_IP/"
