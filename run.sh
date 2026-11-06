#!/usr/bin/env bash
# Vista: one-command setup and run.
#   ./run.sh           install everything, then start the API (http://localhost:4000) and web app (http://localhost:5173)
#   ./run.sh install   install only
#   ./run.sh test      install, then run the automated tests (no keys or database needed)
set -euo pipefail
cd "$(dirname "$0")"

say()  { printf "\n\033[1;35m▸ %s\033[0m\n" "$1"; }
fail() { printf "\n\033[1;31m✗ %s\033[0m\n\nSee RUN_INSTRUCTIONS.md for manual steps.\n" "$1"; exit 1; }

# 1. Node.js 20 or newer
command -v node >/dev/null 2>&1 || fail "Node.js is not installed. Install Node 20+ from https://nodejs.org and run ./run.sh again."
command -v npm  >/dev/null 2>&1 || fail "npm is not installed (it ships with Node.js)."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || fail "Node $(node -v) found, but Vista needs Node 20 or newer."
say "Node $(node -v), npm $(npm -v)"

# 2. Environment file
if [ ! -f .env ]; then
  cp .env.example .env
  fail "No .env found. I created one from .env.example: fill in MONGODB_URI and the Clerk keys, then run ./run.sh again."
fi

# 3. Install dependencies (root, server, client)
say "Installing dependencies (first run takes 1–2 minutes)…"
npm install --no-audit --no-fund
npm --prefix server install --no-audit --no-fund
npm --prefix client install --no-audit --no-fund --include=dev
say "Dependencies installed."

case "${1:-run}" in
  install)
    say "Done. Start the app with: ./run.sh"
    ;;
  test)
    say "Running tests (in-memory database, no keys needed)…"
    npm --prefix server test
    ;;
  run)
    if command -v lsof >/dev/null 2>&1 && lsof -iTCP:4000 -sTCP:LISTEN >/dev/null 2>&1; then
      fail "Port 4000 is already in use. Stop that process (lsof -i :4000) and try again."
    fi
    say "Starting Vista: API on http://localhost:4000 · web app on http://localhost:5173"
    printf "   Demo logins (password Vista#Leave-2026!, code 424242):\n"
    printf "   sysadmin+clerk_test@vista-demo.com · admin+clerk_test@vista-demo.com\n"
    printf "   manager+clerk_test@vista-demo.com  · employee+clerk_test@vista-demo.com\n"
    printf "   Press Ctrl+C to stop.\n\n"
    npm run dev
    ;;
  *)
    fail "Unknown option '$1'. Use: ./run.sh | ./run.sh install | ./run.sh test"
    ;;
esac
