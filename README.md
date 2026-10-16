# Brick Breaker Ball: Unified Vercel backend + ForgePulse Google MCP

A single Next.js 16 project containing:

1. Existing Brick Breaker Ball RTDN purchase-event dashboard and secured authenticated Pub/Sub webhook (ported to Next Route Handlers via a small compatibility adapter).
2. ForgePulse Google MCP Gateway (read-only Google Firebase, Play, Cloud, AdMob, AdSense tools) at `/api/mcp`.

**Start with [START_HERE_AR.md](./START_HERE_AR.md)** for step-by-step Arabic instructions.

## Run

```sh
pnpm install
pnpm test
pnpm build
pnpm dev
```

Requires Node.js 20.9+. `.env.local` should contain your own runtime credentials; see `.env.example`.

## Routes

| HTTP path | Function | Authentication |
|---|---|---|
| `/` | Redirect to `/dashboard.html` | Login for dashboard data |
| `/dashboard.html` | Arabic dashboard shell | Login for API calls |
| `/api/session`, `/api/login`, `/api/logout` | Dashboard auth | Cookie session |
| `/api/events`, `/api/status`, `/api/recheck` | Purchases and event review | Admin session |
| `/api/webhook` | Google Play RTDN notification ingestion | Google Pub/Sub OIDC token |
| `/api/mcp` | 15 read-only Google API tools | Long `MCP_BEARER_TOKEN` |
| `/api/health` | Server is live | Public, no secrets |
| `/mcp-info` | MCP informational page | Public |

## Notes

- `billing/` holds the unchanged older business logic in isolated CommonJS format. TypeScript adapter `src/lib/billing-adapter.ts` adapts the Node requests/responses to Next.js Web APIs. The MongoDB connection, token encryption, cookie session, and Google OIDC verification remain as in the previous backend.
- `app/api/mcp/` retains the submitted ForgePulse read-only tools.
- All secrets stay in environment variables. `.gitignore` keeps them out of Git.
- Google Play event notifications are not proof of fulfilled transactions; the server **does not credit gems automatically**.
- No Next build was performed in the generation environment because package installation could not reach npm. Logic tests and offline syntax checks were executed. Run `pnpm build` locally and deploy to verify framework integration.
- Usage limits/charges for cloud services vary; no guarantee of a permanently free deployment.

For original standalone source references, see `docs/`.
