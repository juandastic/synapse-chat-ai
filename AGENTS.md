# Synapse AI Chat - Agent Instructions

## Cursor Cloud specific instructions

### Project overview
Synapse AI Chat is a React 19 + Vite + Convex SPA with Clerk auth, a knowledge-graph-powered AI backend (Synapse Cortex / Neo4j), and no local databases or Docker containers. See `README.md` for full architecture.

### Running the application
- **Frontend:** `npm run dev` starts Vite on `http://localhost:5173`.
- **Backend:** `npx convex dev` syncs serverless functions to Convex cloud (requires Convex CLI authentication via `npx convex login`). The frontend connects to the already-deployed Convex backend via `VITE_CONVEX_URL`; the Convex dev server is only needed when modifying files under `convex/`.

### Standard dev commands
See `package.json` scripts:
- `npm run lint` — ESLint (flat config in `eslint.config.js`)
- `npm run build` — TypeScript check + Vite production build
- `npm run dev` — Vite dev server with HMR

### Environment variables
Two `.env.local` variables are required for the frontend (`VITE_CONVEX_URL`, `VITE_CLERK_PUBLISHABLE_KEY`). Two more are set in the Convex dashboard (`CLERK_JWT_ISSUER_DOMAIN`, `SYNAPSE_CORTEX_API_SECRET`). See `.env.local.example`.

### Key caveats
- The `convex/_generated/` directory is committed and required. If it goes missing, run `npx convex dev` (requires auth) to regenerate.
- Convex CLI auth token is not available in CI/cloud agent environments. The frontend still works against the deployed backend; only backend code changes require `npx convex dev`.
- No automated test suite exists in this repo. Validation is done via lint, type-check (`tsc -b`), and manual testing.
- The app requires Clerk authentication to function; unauthenticated users see the sign-in page.
