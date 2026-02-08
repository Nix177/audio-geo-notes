#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root (or with sudo)."
  exit 1
fi

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <domain_api> <repo_url>"
  echo "Example: $0 api.example.com https://github.com/Nix177/audio-geo-notes.git"
  exit 1
fi

DOMAIN_API="$1"
REPO_URL="$2"
APP_ROOT="/var/www/audio-geo-notes"
BACKEND_DIR="${APP_ROOT}/backend"
NGINX_CONF="/etc/nginx/sites-available/audio-geo-notes-api"

echo "==> Installing system packages"
apt update
apt install -y curl git nginx certbot python3-certbot-nginx

echo "==> Installing Node.js 20"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

echo "==> Installing PM2"
npm install -g pm2

echo "==> Cloning or updating repository"
mkdir -p /var/www
if [[ -d "${APP_ROOT}/.git" ]]; then
  cd "${APP_ROOT}"
  git fetch origin
  git pull --ff-only
else
  git clone "${REPO_URL}" "${APP_ROOT}"
fi

echo "==> Installing backend dependencies"
cd "${BACKEND_DIR}"
npm install

echo "==> Starting backend with PM2"
pm2 delete audio-geo-notes-api >/dev/null 2>&1 || true
pm2 start src/index.js --name audio-geo-notes-api
pm2 save

echo "==> Writing Nginx config"
cat > "${NGINX_CONF}" <<EOF
server {
    listen 80;
    server_name ${DOMAIN_API};

    client_max_body_size 35M;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -sf "${NGINX_CONF}" /etc/nginx/sites-enabled/audio-geo-notes-api
nginx -t
systemctl reload nginx

echo "==> Requesting HTTPS certificate (Certbot)"
certbot --nginx -d "${DOMAIN_API}" --non-interactive --agree-tos -m "admin@${DOMAIN_API#*.}" --redirect || true

echo "==> Done"
echo "Health endpoint:"
echo "https://${DOMAIN_API}/api/health"
echo
echo "If HTTPS was not issued yet, verify DNS A record for ${DOMAIN_API} points to this VPS IP, then run:"
echo "certbot --nginx -d ${DOMAIN_API}"
