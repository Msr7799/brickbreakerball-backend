# ForgePulse Google MCP Gateway

**A single, private, read-only MCP gateway for Firebase, Google Play Console, Google Cloud (Pub/Sub), AdMob, and AdSense.**

- Next.js 16 / TypeScript / `mcp-handler` 2 / MCP SDK 2
- Native stateless MCP Streamable HTTP endpoint: `/api/mcp`
- Works with remote MCP clients including OpenAI Responses API (an example is included)
- Designed for Vercel; private Bearer token required for **every** MCP request
- No write or publish operations exposed; least-privilege server-side access
- Exactly **15 tools**, with provider-by-provider independent credentials

## 1. Run locally (Windows PowerShell)

1. Unzip, open PowerShell in the project directory.
2. Install Node.js 20+.
3. `npm install`
4. `Copy-Item .env.example .env.local`
5. Fill the variables in `.env.local` using the setup sections below. Avoid committing this file.
6. `npm run dev`
7. Open `http://localhost:3000/api/health` to check the server runs. It does **not** verify Google access.
8. Run `npm run test:logic`. Test the MCP endpoint with `npm run test:mcp` after setting `MCP_BEARER_TOKEN` in your PowerShell session.

**Generate a server token:**

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the output into `MCP_BEARER_TOKEN` in `.env.local` and then into Vercel Environment Variables. Treat it as a password.

## 2. Deploy on Vercel

1. Put the project on your **private** GitHub repository (never add `.env.local`, service-account JSON or refresh tokens).
2. Vercel -> Add New Project -> import the repository.
3. Framework: Next.js; root directory: project root; Install Command `npm install`; Build Command `npm run build`.
4. Project Settings -> Environment Variables: add the keys listed in `.env.example` with your actual secret values. Do not add quote marks around multi-line JSON stored as a single env value. Using compact JSON simplifies copying.
5. Redeploy the project after changing environment values.
6. Open `https://YOUR-PROJECT.vercel.app/api/health`; should respond `{"ok":true,...}`.
7. MCP endpoint: `https://YOUR-PROJECT.vercel.app/api/mcp` (not the `/api/health` URL).

There is **no need to run an extra database for the MCP gateway itself**. Your Firebase Realtime Database remains an existing separate Google service. Vercel usage and upstream Google service quotas/costs are separate; running this project is **not guaranteed to be free**.

## 3. Google account / API setup

### Firebase Realtime Database

- In Firebase Console -> Project Settings -> Service Accounts, generate a server service-account key with the minimum necessary rights for the chosen database. Prefer a dedicated account, not broad Owner/Editor roles.
- Add compact JSON to `FIREBASE_SERVICE_ACCOUNT_JSON`; provide the **actual** Realtime Database URL as `FIREBASE_DATABASE_URL`.
- Configure `FIREBASE_ALLOWED_PREFIX=/mcp` and create a `/mcp` node for AI-readable non-sensitive operational data. Change the prefix only when you're certain about data access.
- Firebase Admin SDK is privileged and **bypasses database Security Rules**. The code restricts the MCP tool to the allowed prefix; service-account IAM permissions alone do not give fine-grained subpath ACLs. Never place passwords, end-user tokens, or private profiles below the exposed prefix.
- If using one service account for both Firebase and other Google services, `FIREBASE_SERVICE_ACCOUNT_JSON` can be omitted and `GOOGLE_SERVICE_ACCOUNT_JSON` reused, provided it belongs to a properly authorized Firebase project.

### Google Play Console

- In Google Cloud Console, enable **Google Play Android Developer API** in the linked Cloud project.
- Make a service account in Cloud IAM, copy its JSON into `GOOGLE_SERVICE_ACCOUNT_JSON`.
- In Google Play Console -> Users and permissions, grant that exact service-account email the minimum permission to view app information, reviews, and monetization products for the app. (The precise UI and required permissions may vary.)
- Set `ANDROID_PACKAGE_NAME=com.forgepulse.brickbreakerball` (change only for a different app).
- Google Play account and Cloud project must be linked correctly; Google Play API access requires Google Play-specific permissions, not Cloud IAM alone.
- Tools: `play_list_reviews`, `play_list_one_time_products`, `play_list_subscriptions`.

### Google Cloud (incl. Pub/Sub)

- Set `GOOGLE_CLOUD_PROJECT_ID` to the **project ID**, not the display name.
- Enable **Cloud Resource Manager API** and **Cloud Pub/Sub API**.
- Grant dedicated service account `Viewer` as applicable and `Pub/Sub Viewer` roles for the target project. Do not grant `Owner` or `Pub/Sub Editor` unless separately needed for another task.
- Tools: `cloud_get_project`, `cloud_list_pubsub_topics`, `cloud_list_pubsub_subscriptions`. These tools do **not** consume Pub/Sub messages or configure a subscription.

### AdMob and AdSense

- In Google Cloud Console, enable **AdMob API** and **AdSense Management API**.
- Set up an OAuth consent screen and create **OAuth Client ID -> Desktop app** under Google Auth Platform / Credentials.
- Set `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` *locally*, then run:

```powershell
$env:GOOGLE_OAUTH_CLIENT_ID="your-client-id"
$env:GOOGLE_OAUTH_CLIENT_SECRET="your-client-secret"
npm run oauth
```

- Open the authorization URL printed in the terminal. Sign in using your own Google account with legitimate access to AdMob and AdSense, grant the requested **read-only** scopes.
- The helper listens only on `127.0.0.1:8765` and prints your `GOOGLE_OAUTH_REFRESH_TOKEN` to the **local** terminal. It never sends it to the MCP endpoint. Copy it securely into `.env.local` and Vercel secret variables, and clear terminal history if desired. Do **not** share it in ChatGPT.
- Google OAuth Testing-mode apps may issue short-lived refresh tokens (often 7 days). For stable, long-term deployment, configure the consent screen/publishing state and required verification as Google requires. Your Google account must actually be able to use the AdMob and AdSense APIs.
- Tools: `admob_list_accounts`, `admob_list_apps`, `admob_list_ad_units`, `admob_network_report`, `adsense_list_accounts`, `adsense_list_sites`, `adsense_report`.
- One refresh token can cover both read-only scopes **if** the signed-in Google identity has access to both services. If the Google accounts differ, run `npm run oauth -- --admob` signed into the AdMob account, and `npm run oauth -- --adsense` signed into the AdSense account; configure `GOOGLE_ADMOB_REFRESH_TOKEN` and `GOOGLE_ADSENSE_REFRESH_TOKEN` respectively. Each per-provider token overrides the common refresh token.

## 4. Connect it to an AI

### OpenAI Responses API (confirmed remote MCP support)

Install `openai` on the machine running your AI app:

```powershell
npm install openai
$env:OPENAI_API_KEY="your-openai-api-key"
$env:MCP_SERVER_URL="https://YOUR-PROJECT.vercel.app"
$env:MCP_BEARER_TOKEN="your-private-MCP-token"
node examples/openai-responses.mjs
```

The example connects to the gateway using `server_url`, passes the bearer token using the MCP `authorization` field, and keeps `require_approval: "always"` so your model's tool usage can be reviewed. For a standalone script, install `openai` in this project or in the folder where your script is run. API charges are separate.

### Cursor / other MCP clients

When a client supports **Streamable HTTP with a bearer authorization header**, configure URL `https://YOUR-PROJECT.vercel.app/api/mcp` and a header `Authorization: Bearer YOUR_PRIVATE_TOKEN`. Some clients require an HTTP bridge or additional auth configuration.

### ChatGPT user interface

This starter supports MCP protocol authentication by a **fixed private bearer token**, but it does **not** implement an OAuth 2.1 authorization server, metadata, or PKCE. Consequently, **ChatGPT UI custom connector installation is not guaranteed to work** with this starter. If your ChatGPT plan/UI requires OAuth discovery, a standards-compliant OAuth authorization layer must be added. The **OpenAI Responses API** route above works with the static bearer-token mechanism, as supported in OpenAI's documentation.

## 5. Available MCP tools (15)

| Tool | Provider | Access |
|---|---|---|
| `gateway_status` | Gateway | configured yes/no (not real Google health check) |
| `firebase_read` | Firebase RTDB | read under prefix only |
| `play_list_reviews` | Play | reviews |
| `play_list_one_time_products` | Play | one-time purchase products |
| `play_list_subscriptions` | Play | subscriptions |
| `cloud_get_project` | Cloud | project metadata |
| `cloud_list_pubsub_topics` | Cloud | topics |
| `cloud_list_pubsub_subscriptions` | Cloud | subscriptions |
| `admob_list_accounts` | AdMob | publisher accounts |
| `admob_list_apps` | AdMob | apps |
| `admob_list_ad_units` | AdMob | ad units |
| `admob_network_report` | AdMob | network earnings (currency micros) |
| `adsense_list_accounts` | AdSense | accounts |
| `adsense_list_sites` | AdSense | sites and state |
| `adsense_report` | AdSense | daily report |

## 6. Security and limitations

- Exposes **read-only Google APIs**, never Google Play releases, deletes, payments, or refunds.
- The MCP bearer token is NOT Google's access token. Keep them separate. Do not let the AI inspect credentials or browse arbitrary paths/URLs.
- Use a **long random token** and HTTPS. Rotate credentials immediately after a leak. Set the repo to private.
- This gateway currently assumes **one owner**. The bearer token grants access to all configured read tools; do not share it with different users. Multi-user support needs per-user OAuth + per-resource authorization.
- Firebase Admin access is privileged even though this MCP wrapper only exposes read operations. Limit the project and service account access.
- Google Play API doesn't expose every Console UI feature; AdMob and AdSense are distinct services. An API error may mean an unapproved/unlinked account, missing scopes, or limited API support.
- Only reads first 100 Firebase children and trims MCP responses to 40k characters. A specific subtree may still contain sensitive data; minimize allowed content.
- `admob_network_report` date range is at most 93 days; dates use YYYY-MM-DD.
- `adsense_report` returns metrics and date dimensions, subject to each account's supported metrics and availability.
- No external Google accounts were accessed in preparing this starter. Its deployment and live Google-authenticated requests were **not** tested here because this environment has no access to your secrets and cannot install dependencies from the npm registry. Run `npm install`, `npm run typecheck`, `npm run build` and the smoke test locally to validate.

## Documentation

- MCP handler: https://github.com/vercel-labs/mcp-handler
- OpenAI remote MCP: https://developers.openai.com/api/docs/guides/tools-connectors-mcp
- Firebase Admin SDK: https://firebase.google.com/docs/admin/setup
- Google Play API: https://developers.google.com/android-publisher/api-ref/rest
- AdMob API: https://developers.google.com/admob/api/v1/reporting
- AdSense API: https://developers.google.com/adsense/management/reference/rest
- Cloud Resource Manager: https://docs.cloud.google.com/resource-manager/reference/rest/v3/projects/get
