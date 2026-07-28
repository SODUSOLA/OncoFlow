#!/usr/bin/env bash
set -euo pipefail

# OncoFlow — Hetzner VPS bootstrap (manual apply)
# Run on each VPS after SSH access is confirmed.
# Usage: ssh root@<vps-ip> 'bash -s' < setup-vps.sh

echo ">>> System update"
apt-get update -qq && apt-get upgrade -qq -y

echo ">>> Install essentials"
apt-get install -qq -y \
  curl wget gnupg ca-certificates \
  ufw unattended-upgrades \
  htop iotop

echo ">>> Configure firewall"
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw --force enable

echo ">>> Enable automatic security updates"
dpkg-reconfigure --priority=low unattended-upgrades