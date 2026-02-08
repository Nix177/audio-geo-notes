# Hostinger VPS Quickstart

This guide deploys:
- frontend on GitHub Pages (or any static host),
- backend API on Hostinger VPS with HTTPS.

## 1) Choose your API domain
Use a subdomain like:
- `api.your-domain.com`

In Hostinger DNS, create an `A` record:
- `Name`: `api`
- `Value`: `<YOUR_VPS_PUBLIC_IP>`

Wait for DNS propagation.

## 2) Connect to your VPS
```bash
ssh root@<YOUR_VPS_PUBLIC_IP>
```

## 3) Run automated setup
```bash
curl -fsSL https://raw.githubusercontent.com/Nix177/audio-geo-notes/main/deploy/hostinger/setup_vps.sh -o setup_vps.sh
chmod +x setup_vps.sh
./setup_vps.sh api.your-domain.com https://github.com/Nix177/audio-geo-notes.git
```

If SSL is not created at first run (DNS not ready), run later:
```bash
certbot --nginx -d api.your-domain.com
```

## 4) Verify backend
From any device:
```text
https://api.your-domain.com/api/health
```

Expected response includes:
- `"ok": true`
- `"status": "up"`

## 5) Point the web app to your API
Edit `index.html` and set:
```html
<script>
  window.VOCAL_WALLS_API_BASE = "https://api.your-domain.com";
</script>
```

Commit and push to your GitHub Pages branch.

## 6) Update backend after new code
SSH to VPS:
```bash
cd /var/www/audio-geo-notes
git pull --ff-only
cd backend
npm install
pm2 restart audio-geo-notes-api
```

## 7) Useful checks
```bash
pm2 status
pm2 logs audio-geo-notes-api
nginx -t
systemctl status nginx
curl https://api.your-domain.com/api/health
```
