#!/usr/bin/env bash
# Run and test Lenore locally. Nothing here touches production or remote data.
#
#   ./run.sh          install (first time), set up the local database, start the app
#   ./run.sh test     typecheck, lint and API tests
#   ./run.sh e2e      browser tests (starts the app if it is not running)
#   ./run.sh reset    wipe the LOCAL database and credentials, then start fresh
set -euo pipefail
cd "$(dirname "$0")"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required (version 22 or newer): https://nodejs.org" >&2
  exit 1
fi
major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt 22 ]; then
  echo "Node.js 22 or newer is required; found $(node -v)." >&2
  exit 1
fi
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  bold "Installing dependencies…"
  npm ci
fi

start() {
  bold "Preparing the local database (migrations + illustrative sample products)…"
  npm run setup:local
  bold "Building the app…"
  npm run build:client
  echo
  bold "Lenore is starting on http://127.0.0.1:8787"
  cat <<'EOF'
  Website            http://127.0.0.1:8787/
  Sales catalogue    http://127.0.0.1:8787/catalogue   (installable app)
  Staff workspace    http://127.0.0.1:8787/manage      (installable "Lenore Admin")
  Billing counter    http://127.0.0.1:8787/pos         (installable "Billing")
EOF
  echo
  bold "Local sign-in (from the ignored local-access.txt):"
  sed -n 's/^\(Username\|Password\): /  \1: /p' local-access.txt
  echo "  Add salespeople under Workspace → Team; tick billing access for cashiers."
  echo
  echo "Press Ctrl+C to stop."
  exec npx wrangler dev --ip 127.0.0.1 --port 8787
}

case "${1:-start}" in
  start) start ;;
  test)
    bold "Typecheck"; npm run typecheck
    bold "Lint"; npm run lint
    bold "API tests (workerd runtime, isolated test database)"; npm test
    bold "All checks passed."
    ;;
  e2e)
    npm run setup:local
    npm run build:client
    bold "Browser tests (uses the local demo database)"
    npm run test:e2e
    ;;
  reset)
    read -r -p "Delete the LOCAL database, uploads and local sign-in? [y/N] " answer
    if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
      rm -rf .wrangler/state .dev.vars local-access.txt
      start
    fi
    ;;
  *)
    echo "Usage: ./run.sh [start|test|e2e|reset]" >&2
    exit 1
    ;;
esac
