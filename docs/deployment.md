# Ubuntu backend deployment

The service runs Gunicorn on loopback port 8000, PostgreSQL on loopback port
5432, and Nginx on public port 80. systemd restarts the API on failure and starts
it at boot. Swagger static files are collected and served by WhiteNoise.

This API includes unauthenticated CRUD. A public deployment permits anyone to
read and modify records. The initial deployment uses HTTP; run the HTTPS setup
below before connecting an HTTPS frontend.

## Prepare the checkout

Use Python 3.12 or 3.13 and run these commands as the account that owns the
checkout. Keep the registered `models/` files and the challenge dataset in the
repository; training directories are unnecessary.

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r server/requirements-production.txt
# CPU model execution. GPU hosts should keep their provider's matching builds.
.venv/bin/python -m pip install torch==2.14.1 torchvision==0.29.1 --index-url https://download.pytorch.org/whl/cpu
.venv/bin/python -m pip install -r server/requirements-inference.txt
sudo bash deploy/bootstrap.sh 64.177.51.140
```

The bootstrap installs PostgreSQL, Nginx, and OpenCV system libraries; creates a
database role and database; generates `.env.production` with mode 0600; runs
migrations, imports the synthetic dataset, and collects static assets; then
installs and starts the services. Rerunning preserves the environment file and
database records, and the importer skips identical records. Do not run it against
an unrelated existing database named `knight_hacks`.

## Configure the frontend origin

Set `DJANGO_CORS_ALLOWED_ORIGINS` in the remote `.env.production` to the exact
frontend origin, or a comma-separated list. The default permits local frontend
development at `http://localhost:5173`. CORS does not provide authentication.
Restart the service after changing environment values:

```sh
sudo systemctl restart knight-hacks-api
```

## Enable HTTPS for the server IP

```sh
sudo bash deploy/https.sh 64.177.51.140
```

The script installs Certbot 5.8 in a separate root-owned environment, obtains a
publicly trusted Let's Encrypt certificate for the IPv4 address, configures
Nginx on port 443, and redirects HTTP requests to HTTPS. HTTP remains available
for ACME validation. Opening `/` over HTTPS redirects to Swagger at `/api/docs`.
It saves the previous Nginx site as `knight-hacks-api.before-https`.

IP certificates last about six days, so a systemd timer checks renewal every
eight hours and reloads Nginx after renewal. The script runs a staging renewal
test. See [Let's Encrypt's IP certificate guidance](https://letsencrypt.org/2026/03/11/shorter-certs-certbot.html).
Bootstrap updates preserve the installed TLS configuration.

```sh
curl --fail https://64.177.51.140/api/health
systemctl status knight-hacks-certbot-renew.timer --no-pager
sudo /opt/knight-hacks-certbot/bin/certbot renew --cert-name knight-hacks-ip --dry-run
```

If HTTPS is unreachable externally, permit inbound TCP port 443 in the provider
firewall. A future domain needs its own certificate and an entry in
`DJANGO_ALLOWED_HOSTS`.

## Verify and maintain

```sh
curl --fail https://64.177.51.140/api/health
curl --fail https://64.177.51.140/api/metrics
curl --fail https://64.177.51.140/api/inference/models
sudo systemctl status knight-hacks-api --no-pager
sudo journalctl -u knight-hacks-api -n 100 --no-pager
```

Swagger is at `/api/docs`. Verify an actual image POST to exercise model loading;
the health route checks only that the API process is responding. Keep PostgreSQL
backups before later schema changes. For manual deployments, transfer the reviewed
backend changes, install any changed requirements, and rerun the bootstrap.
If the API works on the server but not externally, permit inbound TCP port 80
in the provider's firewall.

## Automatic app deployment from GitHub

`.github/workflows/deploy-backend.yml` tests pull requests to `main`. Pushes to
`main` that change frontend, backend, model, challenge data, deployment, or workflow files
run the same tests and then deploy the tested commit. It can also be run manually
from the Actions tab on `main`. Deployment requires both the React production
build and backend tests to pass. Tests use PostgreSQL 17, Python 3.12, and all
four CPU inference checkpoints; frontend builds use Node 22 and the npm lockfile.

The repository needs these Actions secrets:

| Secret | Value |
| --- | --- |
| `VULTR_HOST` | `64.177.51.140` |
| `VULTR_USER` | `admin` |
| `VULTR_SSH_KEY` | Dedicated Ed25519 private key for this deployment |
| `VULTR_KNOWN_HOSTS` | Verified SSH host-key entries for this server |

Upload the matching public key to the server, then perform the one-time setup:

```sh
sudo bash deploy/enable-actions.sh /home/admin/.ssh/github_actions_knight_hacks.pub
```

Setup restricts that key to `deploy <main commit SHA>`, disables forwarding and
interactive SSH for it, and permits only the exact API restart command through
passwordless sudo. Your normal SSH key remains available for administration.
The server must retain its existing read access to the GitHub repository.
The deployment scripts are installed root-owned in `/usr/local/libexec`; rerun
setup after changing `redeploy.sh` or the SSH entrypoint setup.

Enable the frontend once after configuring HTTPS and Actions:

```sh
sudo bash deploy/enable-frontend.sh 64.177.51.140
```

This installs Ubuntu's Node/npm packages, builds the active release's frontend,
and serves it at `https://64.177.51.140/`. API and Swagger requests stay under
`/api/`, and Swagger assets stay under `/static/`. The Vite build sets
`VITE_API_BASE_URL=/api`, so dashboard API mode uses the same HTTPS origin without
needing CORS changes. The default Demo data mode remains selectable.
Nginx serves only built public frontend files under `/var/www/knight-hacks/current`;
the backend releases and secrets remain in the application owner's home directory.
This command also updates the installed deployment helper and preserves ACME
validation, HTTPS redirects, and certificate renewal.

Each deployment fetches `main`, skips superseded commits, extracts the tested
commit into `~/.local/share/knight-hacks/releases/<SHA>`, creates an independent
virtual environment, verifies checkpoints, collects assets, builds the frontend
with `npm ci` and `npm run build`, and runs the API and inference tests. It then
migrates PostgreSQL, switches the backend and frontend `current` symlinks,
restarts Gunicorn, and checks the database-backed metrics route and frontend HTML.
CI also checks public HTTPS health, metrics, frontend HTML, and its JavaScript
bundle. Deployments are serialized both
in Actions and on the server. Existing source checkout files, secrets, Nginx,
certificate renewal, and database records are preserved.

If restart or health checks fail, both frontend and backend switch back to their
previous code releases. Database migrations are not automatically reversed; keep migrations
compatible with the previous release and take backups before destructive schema
changes. Release directories are retained for recovery; remove older inactive
ones manually when disk space requires it.

To inspect the active release:

```sh
readlink /home/admin/.local/share/knight-hacks/current
readlink /var/www/knight-hacks/current
sudo journalctl -u knight-hacks-api -n 100 --no-pager
```

To revoke deployment access, remove its dedicated line from
`~/.ssh/authorized_keys` and delete the `VULTR_SSH_KEY` repository secret.
