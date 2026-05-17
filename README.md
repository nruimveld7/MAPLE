# MAPLE (Modular Applet Platform for Linked Experiences)

MAPLE is a modular platform of Dockerized SvelteKit applets behind a Caddy router.

## Requirements
- Docker Engine with Compose v2 (`docker compose`)

## Quick Start
```bash
docker compose up -d
```

## Stop
```bash
docker compose down
```

## Rebuild One App
```bash
docker compose build xmas
docker compose up -d xmas
```

## View Logs
```bash
docker compose logs -f router
docker compose logs -f xmas
```

## Restart One App
```bash
docker compose restart xmas
```

## Development Mode
Use `docker-compose.dev.yml` and `router/Caddyfile.dev` for a live-edit workflow.

Example:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

## Project Layout
- `landing/`: Landing app
- `auth/`: Auth portal
- `applets/xmas/`: Xmas applet
- `applets/workouts/`: Workouts applet
- `mailer/`: Internal mailer service
- `router/`: Caddy routing config
- `platform/`: Platform app and applet template generator
- `shared-shell/`: Shared UI shell package

## Bundled Scripts
Operational helper scripts are included in-repo under `scripts/`.

Common commands:
```bash
# restart all prod-mode containers
./scripts/AllContainersRestart.sh

# start dev stack
./scripts/DevModeUp.sh

# stop dev stack
./scripts/DevModeDown.sh

# run all DB migrations
./scripts/dbMigrations/MigrateAllDBs.sh
```

## Internal Mailer Service
- Service name: `mailer`
- Internal URL for backend containers: `http://mailer:3000`
- Internal endpoints:
  - `GET /health`
  - `POST /send/template`

### Environment Setup
Provide environment values through your deployment mechanism (for example `.env` with Docker Compose):
- `EMAIL_MODE=console` for local/testing logs only
- `EMAIL_MODE=smtp` for SMTP delivery
- `SMTP_USER=<smtp account username>`
- `SMTP_PASS=<smtp account password or app password>`
- `EMAIL_FROM=<display name and sender address>`
- `MAILER_INTERNAL_API_KEY=<long random internal key>`
- `APP_BRAND=<display brand name, e.g. MAPLE>`
- `VITE_ALLOWED_HOSTS=<comma-separated hostnames for dev server, e.g. your-domain.example,localhost,127.0.0.1>`

### Example `.env` (console mode)
```env
EMAIL_MODE=console
MAILER_INTERNAL_API_KEY=change-me-long-random
APP_BRAND=Your Brand
PUBLIC_APP_ORIGIN=https://your-domain.example
VITE_ALLOWED_HOSTS=your-domain.example,localhost,127.0.0.1
```

### Example `.env` (SMTP mode)
```env
EMAIL_MODE=smtp
MAILER_INTERNAL_API_KEY=change-me-long-random
APP_BRAND=Your Brand
PUBLIC_APP_ORIGIN=https://your-domain.example
SMTP_USER=you@example.com
SMTP_PASS=your-app-password
EMAIL_FROM=Your Brand <you@example.com>
VITE_ALLOWED_HOSTS=your-domain.example,localhost,127.0.0.1
```

### Backend Mailer Integration
Backend containers use:
- `MAILER_URL=http://mailer:3000`
- `MAILER_INTERNAL_API_KEY=<same shared key>`

Requests must include:
- `Authorization: Bearer <MAILER_INTERNAL_API_KEY>`

Current auth helper:
- `auth/src/lib/server/mailerClient.ts`
