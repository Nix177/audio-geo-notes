#!/bin/bash

# Update system
sudo apt-get update

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 and Git
sudo npm install -g pm2
sudo apt-get install -y git

# Create app directory
mkdir -p ~/audio-geo-notes-backend
cd ~/audio-geo-notes-backend

# Clone or update code
# Note: For private repos, this might need an access token. 
# Since we are deploying from local, maybe it's better to use SCP or Git Pull.
git clone https://github.com/Nix177/audio-geo-notes.git . || git pull

# Setup Backend
cd backend
npm install

# Start or Restart Backend with PM2
pm2 stop vocal-walls-backend || true
pm2 start src/index.js --name "vocal-walls-backend"

# Save PM2 state to restart on boot
pm2 save
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME
