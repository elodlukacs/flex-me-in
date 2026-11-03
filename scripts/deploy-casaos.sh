#!/usr/bin/env bash
# Deploys fe-hunt (server + PWA) to the CasaOS box: syncs the source over SSH
# and rebuilds the container there. Run from the repo: `npm run deploy`.
#
#   DEPLOY_HOST  ssh host alias (default: casaos, from ~/.ssh/config)
#   DEPLOY_DIR   directory on the host, relative to its home (default: fe-hunt)
#
# On the first deploy it creates .env.server on the host with a fresh access
# token and the DEEPSEEK_API_KEY from your local .env, and prints the token
# once: the phone asks for it the first time it opens the app.
set -euo pipefail

HOST="${DEPLOY_HOST:-casaos}"
DIR="${DEPLOY_DIR:-fe-hunt}"
cd "$(dirname "$0")/.."

echo "→ syncing source to $HOST:~/$DIR"
ssh "$HOST" "mkdir -p '$DIR'"
# Excluded paths are also protected from --delete, so the host's .env.server
# survives every sync.
rsync -az --delete \
  --exclude node_modules --exclude dist --exclude .git --exclude .idea \
  --exclude .claude --exclude coverage --exclude '.env' --exclude '.env.server' \
  --exclude '*.db' --exclude '*.db-shm' --exclude '*.db-wal' --exclude .DS_Store \
  ./ "$HOST:$DIR/"

if ! ssh "$HOST" "test -f '$DIR/.env.server'"; then
  echo "→ first deploy: creating $DIR/.env.server on $HOST"
  token="$(openssl rand -hex 24)"
  key="$(grep -h -E '^DEEPSEEK_API_KEY=' "$HOME/.flex-me-in/.env" .env 2>/dev/null \
    | head -n 1 | cut -d= -f2- | sed -E 's/[[:space:]]*#.*$//; s/^["'\'']//; s/["'\'']$//' || true)"
  [ -n "$key" ] || echo "  (no DEEPSEEK_API_KEY found locally: the AI filter stays off until you add it there)"
  printf 'FE_HUNT_TOKEN=%s\nDEEPSEEK_API_KEY=%s\n' "$token" "$key" \
    | ssh "$HOST" "umask 077 && cat > '$DIR/.env.server'"
  echo
  echo "  Access token (enter it once in the app on your phone):"
  echo "  $token"
  echo
fi

echo "→ building and starting the container"
ssh "$HOST" "cd '$DIR' && docker compose up -d --build"

echo "→ waiting for the health check"
for _ in $(seq 1 30); do
  if ssh "$HOST" "curl -fsS http://127.0.0.1:8787/api/health >/dev/null 2>&1"; then
    echo "✓ fe-hunt is up on $HOST:8787"
    exit 0
  fi
  sleep 2
done
echo "✗ no healthy response after 60 s — check: ssh $HOST 'docker logs fe-hunt'" >&2
exit 1
