#!/usr/bin/env bash
# One-time setup for the restricted GitHub Actions key and release service.
set -euo pipefail
[[ $EUID -eq 0 && -n ${SUDO_USER:-} && $SUDO_USER != root ]] || {
    echo 'Run with sudo from the account that owns the checkout.' >&2; exit 1;
}
APP_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
DEPLOY_USER=$SUDO_USER
USER_HOME=$(getent passwd "$DEPLOY_USER" | cut -d: -f6)
DEPLOY_ROOT="$USER_HOME/.local/share/knight-hacks"
PUBLIC_KEY_FILE=${1:?Usage: sudo bash deploy/enable-actions.sh PUBLIC_KEY_FILE}
[[ $APP_DIR != *' '* && $DEPLOY_ROOT != *' '* ]] || exit 2
test -f "$APP_DIR/.env.production"
test -x "$APP_DIR/.venv/bin/gunicorn"
ssh-keygen -lf "$PUBLIC_KEY_FILE" >/dev/null
[[ $(awk '{print $1}' "$PUBLIC_KEY_FILE") == ssh-ed25519 ]] || exit 2
DEPLOY_GROUP=$(id -gn "$DEPLOY_USER")
install -d -m 0755 /usr/local/libexec
install -o root -g root -m 0755 "$APP_DIR/deploy/redeploy.sh" /usr/local/libexec/knight-hacks-redeploy
install -d -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" -m 0755 "$DEPLOY_ROOT" "$DEPLOY_ROOT/releases"
if [[ ! -L $DEPLOY_ROOT/current ]]; then
    test ! -e "$DEPLOY_ROOT/current"
    runuser -u "$DEPLOY_USER" -- ln -s "$APP_DIR" "$DEPLOY_ROOT/current"
fi

cat > /usr/local/libexec/knight-hacks-actions <<EOF
#!/usr/bin/env bash
set -euo pipefail
if [[ \${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ ([0-9a-f]{40})\$ ]]; then
    exec /usr/local/libexec/knight-hacks-redeploy '$APP_DIR' '$DEPLOY_ROOT' "\${BASH_REMATCH[1]}"
fi
echo 'This key permits only: deploy <40-character main commit SHA>' >&2
exit 2
EOF
chmod 0755 /usr/local/libexec/knight-hacks-actions
bash -n /usr/local/libexec/knight-hacks-actions

cat > /etc/sudoers.d/knight-hacks-deploy <<EOF
$DEPLOY_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart knight-hacks-api.service
EOF
chmod 0440 /etc/sudoers.d/knight-hacks-deploy
visudo -cf /etc/sudoers.d/knight-hacks-deploy

install -d -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" -m 0700 "$USER_HOME/.ssh"
AUTHORIZED="$USER_HOME/.ssh/authorized_keys"
touch "$AUTHORIZED"
KEY_DATA=$(awk '{print $2}' "$PUBLIC_KEY_FILE")
if ! grep -qF "$KEY_DATA" "$AUTHORIZED"; then
    printf '\nrestrict,command="/usr/local/libexec/knight-hacks-actions" %s\n' \
        "$(cat "$PUBLIC_KEY_FILE")" >> "$AUTHORIZED"
fi
chown "$DEPLOY_USER:$DEPLOY_GROUP" "$AUTHORIZED"
chmod 0600 "$AUTHORIZED"

if [[ ! -f /etc/systemd/system/knight-hacks-api.service.before-actions ]]; then
    cp -p /etc/systemd/system/knight-hacks-api.service /etc/systemd/system/knight-hacks-api.service.before-actions
fi
cat > /etc/systemd/system/knight-hacks-api.service <<EOF
[Unit]
Description=Knight Hacks Django API
After=network.target postgresql.service
Requires=postgresql.service

[Service]
User=$DEPLOY_USER
WorkingDirectory=$DEPLOY_ROOT/current
EnvironmentFile=$APP_DIR/.env.production
ExecStart=$DEPLOY_ROOT/current/.venv/bin/gunicorn --config $DEPLOY_ROOT/current/deploy/gunicorn.conf.py config.wsgi:application
Restart=on-failure
RestartSec=5
TimeoutStopSec=40
UMask=0077
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl restart knight-hacks-api.service
curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 1 \
    -H 'Host: 127.0.0.1' http://127.0.0.1:8000/api/health
echo
echo 'GitHub Actions deployment access is ready.'
