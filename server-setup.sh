#!/usr/bin/env bash
#
# Racko-cloud — one-time Debian 12 server bootstrap
# Run as root on a fresh VPS:  bash server-setup.sh
#
set -euo pipefail

if [[ "${EUID:-0}" -ne 0 ]]; then
  echo "ERROR: This script must be run as root." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

log() {
  echo "[racko-setup] $*"
}

# ─── SYSTEM ───────────────────────────────────────────────────────────────────
log "Updating system packages..."
apt-get update -y
apt-get upgrade -y

log "Installing base packages..."
apt-get install -y \
  curl \
  wget \
  git \
  ufw \
  fail2ban \
  ca-certificates \
  gnupg \
  lsb-release \
  certbot \
  python3-certbot-nginx

# ─── DOCKER ───────────────────────────────────────────────────────────────────
log "Installing Docker CE from the official Docker apt repository..."
install -m 0755 -d /etc/apt/keyrings

if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
fi

if [[ ! -f /etc/apt/sources.list.d/docker.list ]]; then
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" \
    > /etc/apt/sources.list.d/docker.list
fi

apt-get update -y
apt-get install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin

systemctl enable docker
systemctl start docker

# ─── DEPLOY USER ──────────────────────────────────────────────────────────────
log "Creating deploy user 'racko'..."
if ! id racko &>/dev/null; then
  useradd -m -s /bin/bash racko
fi

usermod -aG docker racko

install -d -m 0700 /home/racko/.ssh
touch /home/racko/.ssh/authorized_keys
chmod 600 /home/racko/.ssh/authorized_keys
chown -R racko:racko /home/racko/.ssh

log "Creating /opt/racko-cloud layout..."
install -d -m 0755 /opt/racko-cloud/nginx/conf.d
install -d -m 0755 /opt/racko-cloud/certbot/www
chown -R racko:racko /opt/racko-cloud

# ─── FIREWALL ─────────────────────────────────────────────────────────────────
log "Configuring UFW..."
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ─── FAIL2BAN ─────────────────────────────────────────────────────────────────
log "Enabling fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban

# ─── SSH HARDENING ────────────────────────────────────────────────────────────
log "Hardening SSH configuration..."
SSHD_CONFIG="/etc/ssh/sshd_config"
MARKER="# racko-cloud hardening"

if ! grep -qF "${MARKER}" "${SSHD_CONFIG}"; then
  cat >> "${SSHD_CONFIG}" <<EOF

${MARKER}
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
EOF
  systemctl reload sshd
  log "SSH hardening applied and sshd reloaded."
else
  log "SSH hardening block already present — skipping."
fi

# ─── SYSTEMD SERVICE ──────────────────────────────────────────────────────────
log "Creating racko-cloud systemd service..."
cat > /etc/systemd/system/racko-cloud.service <<'EOF'
[Unit]
Description=Racko Cloud Docker Compose Stack
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/racko-cloud
User=racko
Group=racko
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable racko-cloud.service

# ─── END — MANUAL NEXT STEPS ──────────────────────────────────────────────────
cat <<'EOF'

================================================================================
 Racko-cloud server bootstrap complete
================================================================================

Complete these manual steps before going live:

 1. SSH access for GitHub Actions deploy user
    On your local machine, generate a deploy key (if you have not already):
      ssh-keygen -t ed25519 -f racko_deploy_key -N ""

    Add the PUBLIC key to the server:
      cat racko_deploy_key.pub >> /home/racko/.ssh/authorized_keys
      chown racko:racko /home/racko/.ssh/authorized_keys
      chmod 600 /home/racko/.ssh/authorized_keys

    Store the PRIVATE key (racko_deploy_key) in GitHub secret VM_SSH_KEY.

 2. Environment file
    Copy the repo .env.example to the server and fill in all values:
      /opt/racko-cloud/.env

    Required: MongoDB credentials, JWT secrets, SendGrid, Proxmox, domain URLs.

 3. Deploy compose + nginx config
    From your workstation (replace USER and HOST):
      scp docker-compose.yml USER@HOST:/opt/racko-cloud/
      scp nginx/conf.d/racko.conf USER@HOST:/opt/racko-cloud/nginx/conf.d/

    Edit racko.conf on the server — replace yourdomain.com and api.yourdomain.com
    with your real hostnames.

 4. DNS
    Create A records pointing to this server's public IP:
      yourdomain.com      -> SERVER_IP
      api.yourdomain.com  -> SERVER_IP

 5. TLS certificates (after DNS propagates)
    Stop nginx in the stack to free port 80, then obtain certs:
      cd /opt/racko-cloud
      sudo -u racko docker compose stop nginx
      certbot certonly --standalone -d yourdomain.com --agree-tos -m you@yourdomain.com
      certbot certonly --standalone -d api.yourdomain.com --agree-tos -m you@yourdomain.com
      sudo -u racko docker compose up -d

 6. GitHub Actions secrets
    Configure in the repository settings:
      DOCKERHUB_USERNAME, DOCKERHUB_TOKEN, NEXT_PUBLIC_API_URL,
      VM_HOST, VM_USER (= racko), VM_SSH_KEY, SLACK_WEBHOOK_URL

 7. First boot (as racko)
      cd /opt/racko-cloud
      docker compose pull
      docker compose up -d
      docker compose ps
      docker compose exec core-api node dist/scripts/seedSuperAdmin.js

 8. Enable automated deploys
    Push to the main branch to trigger build, push to Docker Hub, and rolling deploy.

See DEPLOY.md in the repository for the full deployment guide.

================================================================================
EOF
