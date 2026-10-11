#!/usr/bin/env bash
# Ubuntu bootstrap, after installing the Python requirements in .venv.
set -euo pipefail

if [[ $EUID -ne 0 || -z ${SUDO_USER:-} || $SUDO_USER == root ]]; then
    echo 'Run this script with sudo from the account that owns the checkout.' >&2
    exit 1
fi
APP_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
DEPLOY_USER=$SUDO_USER
PUBLIC_HOST=${1:?Usage: sudo bash deploy/bootstrap.sh PUBLIC_IP_OR_DOMAIN}
if [[ ! $PUBLIC_HOST =~ ^[a-zA-Z0-9.-]+$ || $APP_DIR == *' '* ]]; then
    echo 'Use a hostname or IPv4 address and a checkout path without spaces.' >&2
    exit 1
fi
PYTHON="$APP_DIR/.venv/bin/python"
"$PYTHON" -c 'import django, gunicorn, whitenoise'

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y postgresql nginx libgl1 libglib2.0-0
systemctl enable --now postgresql

# Generate deployment credentials once, without printing them or putting them
# in shell history. The environment file works with both bash and systemd.
if [[ ! -f $APP_DIR/.env.production ]]; then
    runuser -u "$DEPLOY_USER" -- "$PYTHON" - "$APP_DIR/.env.production" "$PUBLIC_HOST" <<'PY'
import os
import secrets
import sys
from pathlib import Path

path = Path(sys.argv[1])
password = secrets.token_hex(32)
values = {
    'DJANGO_SETTINGS_MODULE': 'config.production',
    'DJANGO_DEBUG': 'false',
    'DJANGO_SECRET_KEY': secrets.token_hex(48),
    'DJANGO_ALLOWED_HOSTS': f'{sys.argv[2]},localhost,127.0.0.1',
    'DJANGO_CORS_ALLOWED_ORIGINS': 'http://localhost:5173',
    'DATABASE_URL': f'postgresql://knight_hacks:{password}@127.0.0.1:5432/knight_hacks',
}
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as stream:
    stream.write(''.join(f'{key}={value}\n' for key, value in values.items()))
PY
fi

# Send SQL over stdin so the database password never appears in process args.
"$PYTHON" - "$APP_DIR/.env.production" <<'PY' | runuser -u postgres -- psql -v ON_ERROR_STOP=1
import sys
from pathlib import Path
from urllib.parse import urlparse

env = dict(line.split('=', 1) for line in Path(sys.argv[1]).read_text().splitlines() if line)
password = urlparse(env['DATABASE_URL']).password
if not password or any(c not in '0123456789abcdef' for c in password):
    raise SystemExit('Bootstrap expects its generated hexadecimal database password.')
print("SELECT 'CREATE ROLE knight_hacks LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'knight_hacks')\\gexec")
print(f"ALTER ROLE knight_hacks PASSWORD '{password}';")
print("SELECT 'CREATE DATABASE knight_hacks OWNER knight_hacks' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'knight_hacks')\\gexec")
PY

runuser -u "$DEPLOY_USER" -- bash -c '
    set -euo pipefail
    cd "$1"
    set -a
    source .env.production
    set +a
    .venv/bin/python server/manage.py migrate --noinput
    .venv/bin/python server/manage.py import_challenge_data
    .venv/bin/python server/manage.py collectstatic --noinput
    .venv/bin/python server/manage.py check
' bash "$APP_DIR"

# Keep the release-based service installed by enable-actions.sh.
if ! grep -q '/current/' /etc/systemd/system/knight-hacks-api.service 2>/dev/null; then
cat > /etc/systemd/system/knight-hacks-api.service <<EOF
[Unit]
Description=Knight Hacks Django API
After=network.target postgresql.service
Requires=postgresql.service

[Service]
User=$DEPLOY_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env.production
ExecStart=$APP_DIR/.venv/bin/gunicorn --config $APP_DIR/deploy/gunicorn.conf.py config.wsgi:application
Restart=on-failure
RestartSec=5
TimeoutStopSec=40
UMask=0077
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
fi

# Preserve the TLS configuration installed by https.sh on later deployments.
if ! [[ -f /etc/letsencrypt/live/knight-hacks-ip/fullchain.pem ]] || ! grep -q 'listen 443 ssl' /etc/nginx/sites-available/knight-hacks-api; then
cat > /etc/nginx/sites-available/knight-hacks-api <<EOF
server {
    listen 80;
    server_name $PUBLIC_HOST;
    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 180s;
    }
}
EOF
fi
ln -sfn /etc/nginx/sites-available/knight-hacks-api /etc/nginx/sites-enabled/knight-hacks-api
nginx -t
systemctl daemon-reload
systemctl enable --now knight-hacks-api nginx
systemctl restart knight-hacks-api
systemctl reload nginx
# Add HTTP only if the host firewall is already active; preserve SSH access.
if command -v ufw >/dev/null && ufw status | head -1 | grep -q 'Status: active'; then
    ufw allow 80/tcp
fi
if grep -q 'listen 443 ssl' /etc/nginx/sites-available/knight-hacks-api; then
    API_URL="https://$PUBLIC_HOST"
    curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 1 \
        --resolve "$PUBLIC_HOST:443:127.0.0.1" "$API_URL/api/health"
else
    API_URL="http://$PUBLIC_HOST"
    curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 1 \
        -H "Host: $PUBLIC_HOST" http://127.0.0.1/api/health
fi
echo
echo "API ready: $API_URL/api/health"
