# FinDashboard

[![CI](https://github.com/PavellVit/fin-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/PavellVit/fin-dashboard/actions/workflows/ci.yml)

Realtime fintech dashboard: Angular 22 with a WebAssembly (AssemblyScript) market-data producer running in a Web Worker.

- **Live demo:** https://fin-dashboard-ruby.vercel.app/
- **Repository:** https://github.com/PavellVit/fin-dashboard

## Build / Run / Test

Requires Node 24 (see `.nvmrc`).

```bash
nvm use
npm ci
npm start            # dev server on http://localhost:4200
npm run build        # production build -> dist/fin-dashboard/browser
npm test             # unit tests (Vitest), watch mode
npm run test:ci      # single test run, as in CI
npm run lint         # ESLint (angular-eslint)
npm run format       # Prettier; CI runs format:check
```

## CI / Deployment

- **CI:** GitHub Actions (`.github/workflows/ci.yml`) on every push and PR: format check -> lint -> build -> tests.
- **Deploy:** Vercel builds every push with `npm run build` (pinned in `vercel.json`). Deploys are not gated by CI: a failing work-in-progress test never blocks the live demo, and the CI status is visible on every commit.
- **Push -> live:** measured ~30 s of build time; the new version is served a few seconds later.
- **Wasm MIME type:** Vercel serves `.wasm` as `application/wasm` (verified with `curl -I`).
