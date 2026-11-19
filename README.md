# ForgePulse MCP + Brick Breaker Ball · Unified Vercel Backend

> **الإصدار 2:** أضفنا لوحة `/mcp-dashboard` بتصميم كريم/زيتوني/فحمي، فحوص اتصال حقيقية وسجل تنفيذ، مع الحفاظ على إشعارات Google Play.
>
> ابدأ من: [README_FORGEPULSE_DASHBOARD_AR.md](README_FORGEPULSE_DASHBOARD_AR.md)
>
> ملاحظة: توجد أدوات كتابة محددة تتطلب `MCP_WRITE_ENABLED=true` وOAuth `mcp:write` مع تأكيد صريح؛ لا تعرض الرموز السرية ولا ترفع ملفات `.env.local`.

# Brick Breaker Ball: Unified Vercel backend + ForgePulse Google MCP

A single Next.js 16 project containing:

1. Existing Brick Breaker Ball RTDN purchase-event dashboard and secured authenticated Pub/Sub webhook (ported to Next Route Handlers via a small compatibility adapter).
2. ForgePulse Google MCP Gateway (scoped Google Firebase, Play, Cloud, AdMob, AdSense tools) at `/api/mcp`.
3. Private ForgePulse AI chat at `/mcp-dashboard/chat` with Gemini, Tavily, PDF/image input, and MCP controls. See [Arabic chat guide](docs/FORGEPULSE_AI_CHAT_AR.md).

**Start with [START_HERE_AR.md](./START_HERE_AR.md)** for step-by-step Arabic instructions.

**ChatGPT MCP OAuth 2.1:** [دليل الربط الآمن (CIMD + PKCE)](docs/CHATGPT_MCP_OAUTH_AR.md). OAuth is opt-in (`MCP_OAUTH_ENABLED=true`) and keeps the previous bearer authentication operational.

**Google Play Store Presence:** [دليل إدارة بطاقة المتجر والصور + أدوات التشخيص وسجل الطلبات](docs/GOOGLE_PLAY_ADMIN_AR.md). New edit sessions are scoped to `ANDROID_PACKAGE_NAME`, verified with Google, and kept in MongoDB; publishing is never implicit.

## Run

```sh copybtn
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
| `/api/mcp` | Read-only diagnostics and explicitly confirmed Google admin tools | OAuth `mcp:write` for mutations; legacy bearer is read-only |
| `/api/mcp-control/upload` | Authenticated PNG/JPEG upload to a temporary Play edit | Admin session, origin check, explicit confirmation |
| `/mcp-dashboard/chat` | Arabic AI chat and MCP tool controls | Admin session |
| `/api/assistant` | Chat, history, settings, and connection test | Admin session |
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
