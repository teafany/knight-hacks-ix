#!/usr/bin/env bash
# Add a trusted Let's Encrypt IP certificate to the existing Ubuntu deployment.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
    echo 'Run this script with sudo.' >&2
    exit 1
fi
PUBLIC_IP=${1:?Usage: sudo bash deploy/https.sh PUBLIC_IPV4_ADDRESS}
python3 - "$PUBLIC_IP" <<'PY'
import ipaddress
import sys
address = ipaddress.IPv4Address(sys.argv[1])
if not address.is_global:
    raise SystemExit('Use the public IPv4 address of this server.')
PY

SITE=/etc/nginx/sites-available/knight-hacks-api
WEBROOT=/var/www/knight-hacks-acme
CERTBOT=/opt/knight-hacks-certbot/bin/certbot
CERT_NAME=knight-hacks-ip
CERT_DIR="/etc/letsencrypt/live/$CERT_NAME"
test -f "$SITE"
systemctl is-active --quiet knight-hacks-api

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y python3-venv ca-certificates
if [[ ! -x $CERTBOT ]]; then
    python3 -m venv /opt/knight-hacks-certbot
fi
/opt/knight-hacks-certbot/bin/python -m pip install --disable-pip-version-check certbot==5.8.0
install -d -m 0755 "$WEBROOT/.well-known/acme-challenge" /usr/local/libexec
if [[ ! -f $SITE.before-https ]]; then
    cp -p "$SITE" "$SITE.before-https"
fi

# Preserve any existing TLS listener on reruns while enabling HTTP validation.
python3 - "$SITE" "$WEBROOT" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
config = path.read_text()
if 'location ^~ /.well-known/acme-challenge/' not in config:
    location = f'''    location ^~ /.well-known/acme-challenge/ {{
        root {sys.argv[2]};
        default_type text/plain;
        try_files $uri =404;
    }}

'''
    marker = '    location / {'
    if marker not in config:
        raise SystemExit('Existing Nginx config does not match this deployment.')
    path.write_text(config.replace(marker, location + marker, 1))
PY
nginx -t
systemctl reload nginx

cat > /usr/local/libexec/knight-hacks-certbot-reload <<'EOF'
#!/bin/sh
set -eu
/usr/sbin/nginx -t
/usr/bin/systemctl reload nginx
EOF
chmod 0755 /usr/local/libexec/knight-hacks-certbot-reload

# The IP is already public. No personal email address is sent to the CA.
"$CERTBOT" certonly --non-interactive --agree-tos --register-unsafely-without-email \
    --webroot --webroot-path "$WEBROOT" --ip-address "$PUBLIC_IP" \
    --cert-name "$CERT_NAME" --required-profile shortlived \
    --deploy-hook /usr/local/libexec/knight-hacks-certbot-reload

cat > "$SITE" <<EOF
server {
    listen 80;
    server_name $PUBLIC_IP;

    location ^~ /.well-known/acme-challenge/ {
        root $WEBROOT;
        default_type text/plain;
        try_files \$uri =404;
    }

    location / {
        return 308 https://$PUBLIC_IP\$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name $PUBLIC_IP;
    ssl_certificate $CERT_DIR/fullchain.pem;
    ssl_certificate_key $CERT_DIR/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:KnightHacksSSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    client_max_body_size 10m;

    location = / {
        return 302 /api/docs;
    }

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
nginx -t
systemctl reload nginx

cat > /etc/systemd/system/knight-hacks-certbot-renew.service <<EOF
[Unit]
Description=Renew Knight Hacks IP TLS certificate
After=network-online.target nginx.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=$CERTBOT renew --quiet --cert-name $CERT_NAME
EOF
cat > /etc/systemd/system/knight-hacks-certbot-renew.timer <<'EOF'
[Unit]
Description=Check Knight Hacks IP TLS certificate every eight hours

[Timer]
OnCalendar=*-*-* 00,08,16:00:00
RandomizedDelaySec=600
Persistent=true

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now knight-hacks-certbot-renew.timer
if command -v ufw >/dev/null && ufw status | head -1 | grep -q 'Status: active'; then
    ufw allow 443/tcp
fi

curl --fail --silent --show-error --resolve "$PUBLIC_IP:443:127.0.0.1" \
    "https://$PUBLIC_IP/api/health"
echo
# Staging renewal checks the HTTP challenge route and reload hook without
# replacing the live certificate or consuming a production issuance.
"$CERTBOT" renew --cert-name "$CERT_NAME" --dry-run --run-deploy-hooks
echo "HTTPS ready: https://$PUBLIC_IP/api/docs"
