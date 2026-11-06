# Running Vista

## Quickest: use the live app
- **https://vista.praneethm.dev**
- **https://vista-btyc.vercel.app**: the same app, for networks that block the custom domain (e.g. campus Wi-Fi)

The demo logins and a guided tour are in [`WALKTHROUGH.md`](WALKTHROUGH.md).

## One command
```bash
chmod +x run.sh   # only needed once, if the zip lost the permission
./run.sh          # installs everything, then starts the app
```

The app runs at:
- **Web:** http://localhost:5173. If that port is busy, Vite picks the next one, e.g. 5174; the terminal shows the URL.
- **API:** http://localhost:4000. Health check: http://localhost:4000/api/health

| Command | What it does |
|---|---|
| `./run.sh install` | Install only |
| `./run.sh test` | Run the automated tests. No keys, database or internet needed after install |

## Manual steps (if `run.sh` fails)
**Requirements:** Node.js **20 or newer** (`node -v`) and npm.

From the project folder:
```bash
# 1. Environment: the .env file is included in this zip. If it's missing:
cp .env.example .env   # then fill in MONGODB_URI and the Clerk keys

# 2. Install
npm install
npm --prefix server install
npm --prefix client install --include=dev

# 3. Start the API and web app together
npm run dev

#    Or in two terminals:
npm --prefix server run dev   # API on :4000
npm --prefix client run dev   # web on :5173

# 4. Tests (optional)
npm --prefix server test
```

**Windows:** run the manual steps in PowerShell or Git Bash. `run.sh` needs Git Bash or WSL.

## Demo logins
The password for all of them is `Vista#Leave-2026!`. If Clerk asks for a verification code, enter `424242`.

| Role | Email |
|---|---|
| System admin | `sysadmin+clerk_test@vista-demo.com` |
| Admin · HOD | `admin+clerk_test@vista-demo.com` |
| Manager | `manager+clerk_test@vista-demo.com` |
| Employee | `employee+clerk_test@vista-demo.com` |

The database already contains the demo company. To reset it:
```bash
npm run seed && npm --prefix server run seed:org
```

## Troubleshooting
| Problem | Fix |
|---|---|
| `Node … found, but Vista needs Node 20` | Install Node 20+ from https://nodejs.org |
| `Port 4000 is already in use` | `lsof -i :4000`, then stop that process |
| API log shows `Could not connect to any servers in your MongoDB Atlas cluster` | The network is blocking MongoDB (port 27017) or your IP isn't allowed in Atlas. Try another network or hotspot. Atlas network access is open to `0.0.0.0/0` |
| `Invalid environment: MONGODB_URI is missing` | `.env` is missing or empty. See step 1 |
| Login page spins or a Clerk error appears | Use a normal (non-private) browser window with cookies allowed, or use the live URL |
| A blank page after a code update | Hard-refresh: Cmd+Shift+R or Ctrl+Shift+R |
| `npm install` fails behind a proxy | `npm config set registry https://registry.npmjs.org/`, then retry |
