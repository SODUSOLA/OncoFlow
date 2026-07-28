# OncoFlow — Infra provisioning (manual apply)

## Architecture

```
Internet → Cloudflare DNS → Coolify (app VPS) + PgBouncer → PostgreSQL (db VPS)
                                                          → Redis (app VPS)
```

- **App server:** Hetzner CX23 (2 vCPU, 4 GB RAM) — Coolify, app containers, Redis
- **DB server:** Hetzner CX23 (2 vCPU, 4 GB RAM) — PostgreSQL 16, PgBouncer
- **Private networking** between the two VPS via Hetzner VLAN

## Prerequisites

1. Two Hetzner VPS provisioned with Ubuntu 24.04
2. Private network created in Hetzner Cloud Console
3. Both VPS cattached to the private network
4. SSH access confirmed to both VPS (root or sudo user)
5. Domain(s) registered — DNS managed in Cloudflare

## Steps

### 1. Bootstrap both VPS

```bash
ssh root@<app-vps-ip> 'bash -s' < setup-vps.sh
ssh root@<db-vps-ip> 'bash -s' < setup-vps.sh
```

### 2. DB server — PostgreSQL + PgBouncer

SSH into the DB VPS:

```bash
# Install PostgreSQL 16
apt-get install -y postgresql-16

# Configure pg_hba.conf to allow private-network connections from app VPS
#   host oncoflow oncoflow <app-vps-private-ip>/32 scram-sha-256

# Install PgBouncer
apt-get install -y pgbouncer
# /etc/pgbouncer/pgbouncer.ini:
#   pool_mode = transaction
#   listen_addr = 0.0.0.0
#   listen_port = 6432

systemctl enable --now postgresql pgbouncer
```

### 3. App server — Coolify + Docker

SSH into the app VPS:

```bash
# Install Docker
curl -fsSL https://get.docker.com | bash

# Install Coolify via its install script
curl -fsSL https://coolify.io/install | bash
```

Then open the Coolify web UI and:
- Connect the app VPS as a localhost server (Coolify is already on it)
- Connect the DB VPS via SSH (add as a remote server)
- Add GitHub repo as a private Git source
- Create resources: app container, Redis container
- Point app container at `pgbouncer://<db-vps-private-ip>:6432/oncoflow`

### 4. Cloudflare

```bash
# R2 bucket setup
./cloudflare/r2-setup.sh
```

- Create Cloudflare Pages project connected to the `frontend/` directory
- Set DNS records:
  - `api.oncoflow.com.ng` → Coolify app
  - `uploads.oncoflow.com.ng` → R2 bucket (public URL)
  - `pages.oncoflow.com.ng` → Cloudflare Pages

### 5. Local dev

```bash
docker compose -f infra/docker-compose.yml up -d
# DB at localhost:6432 via PgBouncer, Redis at localhost:6379
```

## Secrets to store in Coolify

| Key | Source |
|---|---|
| `DATABASE_URL` | `postgresql://oncoflow:<pw>@<db-private-ip>:6432/oncoflow` |
| `REDIS_URL` | `redis://localhost:6379` |
| `R2_ACCOUNT_ID` | Cloudflare dashboard |
| `R2_ACCESS_KEY_ID` | R2 API token |
| `R2_SECRET_ACCESS_KEY` | R2 API token |
| `R2_BUCKET_NAME` | `oncoflow-uploads` |
| `JWT_SECRET` | `openssl rand -hex 64` |
| `MONNIFY_API_KEY` | Monnify dashboard |
| `MONNIFY_SECRET_KEY` | Monnify dashboard |
| `VIDEO_SDK_KEY` | Whereby / Daily API key |