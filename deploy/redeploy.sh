#!/usr/bin/env bash
# Installed root-owned by enable-actions.sh; runs as the unprivileged app owner.
set -euo pipefail

SOURCE_DIR=${1:?Missing source checkout}
DEPLOY_ROOT=${2:?Missing deployment root}
DEPLOY_SHA=${3:?Missing commit SHA}
[[ $DEPLOY_SHA =~ ^[0-9a-f]{40}$ ]] || exit 2
[[ $EUID -ne 0 ]] || { echo 'Deployments must run as the app owner.' >&2; exit 2; }
mkdir -p "$DEPLOY_ROOT/releases"
exec 9> "$DEPLOY_ROOT/deployment.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }

cd "$SOURCE_DIR"
git fetch --no-tags origin refs/heads/main:refs/remotes/origin/main
if [[ $(git rev-parse refs/remotes/origin/main) != "$DEPLOY_SHA" ]]; then
    echo 'A newer main commit superseded this deployment; skipping.'
    exit 0
fi
git cat-file -e "$DEPLOY_SHA^{commit}"
RELEASE="$DEPLOY_ROOT/releases/$DEPLOY_SHA"
if [[ ! -f $RELEASE/.prepared ]]; then
    mkdir -p "$RELEASE"
    git archive "$DEPLOY_SHA" | tar -x -C "$RELEASE"
    # The model publication verifier also checks the release's Git ignore policy.
    git init --quiet "$RELEASE"
    "$SOURCE_DIR/.venv/bin/python" -m venv "$RELEASE/.venv"
    "$RELEASE/.venv/bin/python" -m pip install --quiet -r "$RELEASE/server/requirements-production.txt"
    "$RELEASE/.venv/bin/python" -m pip install --quiet torch==2.14.1 torchvision==0.29.1 \
        --index-url https://download.pytorch.org/whl/cpu
    "$RELEASE/.venv/bin/python" -m pip install --quiet -r "$RELEASE/server/requirements-inference.txt"
    "$RELEASE/.venv/bin/python" -m pip check
fi

set -a
source "$SOURCE_DIR/.env.production"
set +a
export OMP_NUM_THREADS=2 MKL_NUM_THREADS=2
cd "$RELEASE"
.venv/bin/python server/manage.py check
.venv/bin/python models/verify_publish.py
.venv/bin/python server/manage.py collectstatic --noinput
# Each release has its own environment; test it before switching the API.
DJANGO_DB_BACKEND=sqlite .venv/bin/python server/manage.py test api
.venv/bin/python server/manage.py migrate --noinput
touch .prepared

PREVIOUS=$(readlink "$DEPLOY_ROOT/current")
switch_release() {
    ln -s "$1" "$DEPLOY_ROOT/.current-$DEPLOY_SHA"
    mv -Tf "$DEPLOY_ROOT/.current-$DEPLOY_SHA" "$DEPLOY_ROOT/current"
}
healthy() {
    curl --fail --silent --show-error --max-time 15 --retry 10 \
        --retry-connrefused --retry-all-errors --retry-delay 2 \
        -H 'Host: 127.0.0.1' http://127.0.0.1:8000/api/metrics > /dev/null
}
switch_release "$RELEASE"
if ! sudo -n /usr/bin/systemctl restart knight-hacks-api.service || ! healthy; then
    echo 'Deployment failed; restoring the previous code release.' >&2
    switch_release "$PREVIOUS"
    sudo -n /usr/bin/systemctl restart knight-hacks-api.service
    healthy
    exit 1
fi
echo "Deployed commit $DEPLOY_SHA"
