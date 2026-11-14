# ForgePulse management: Pub/Sub, AdMob and AdSense

This update adds **9 tools** to the 31 existing MCP tools, bringing the total to **40**: five narrowly scoped mutation tools plus four AdSense read-only diagnostics.

## AdSense account-readiness diagnostics
The AdSense Management API can supply:
- `adsense_list_alerts` — account alerts, which may point to required actions.
- `adsense_list_policy_issues` — policy violations visible to the API.
- `adsense_list_payments` — payout transaction summaries, **not** bank account or payment-method details.
- `adsense_list_adclients` — available ad clients.
- Existing tools `adsense_list_accounts`, `adsense_list_sites`, `adsense_report` report account readiness, site approval states and earnings.

**Limits:** Google account payments setup, identity verification, tax forms, PIN/mail verification, adding/changing a bank, approval of sites, and appeals require completing steps in the Google AdSense UI. An AdSense account `READY` does not mean every website is approved: a site `GETTING_READY` requires Google review.

## Mutating tools (require Google authorization + explicit human confirmation)
1. `pubsub_create_topic`: creates only new topics whose IDs begin `forgepulse-`.
2. `pubsub_create_pull_subscription`: creates only `forgepulse-`-prefixed pull subscriptions to `forgepulse-` topics.
3. `pubsub_update_pull_ack_deadline`: updates only an existing `forgepulse-` pull subscription attached to a `forgepulse-` topic, never a push subscription.
4. `admob_create_ad_unit`: creates an AdMob ad unit only if Google approved the developer project for this restricted API; restricted `admob.monetization` OAuth scope required.
5. `adsense_create_display_ad_unit`: creates an AdSense responsive display ad unit **only for Google-approved AdSense for Platforms developer projects and AFC ad clients**. Google may reject even when the human account is Administrator.

No tool modifies payment profiles, banks, tax information, site review outcomes, or current Google Play RTDN push subscriptions. The separate Google Cloud project ID must not be replaced with the Firebase Insights project ID.

## Permissions and practical setup
- ForgePulse MCP caller needs OAuth `mcp:read mcp:write` and each write needs `confirm:true`. Console writes need typed `CONFIRM` plus second browser confirmation. Global setting `MCP_WRITE_ENABLED=true` must be enabled. All writes require mandatory audit-before-mutate.
- **Google Cloud Pub/Sub**: `GOOGLE_SERVICE_ACCOUNT_JSON` needs access to the configured `GOOGLE_CLOUD_PROJECT_ID` (typically `roles/pubsub.editor` or a narrowly scoped custom role). The earlier 403 for topic/subscription listing indicates this account lacks access; these write tools will fail until IAM is fixed.
- **AdMob**: Your local interactive OAuth grant must include `https://www.googleapis.com/auth/admob.readonly` plus `https://www.googleapis.com/auth/admob.monetization`. Run `pnpm oauth -- --admob --write` locally after setting client ID/secret; store new refresh token in `GOOGLE_ADMOB_REFRESH_TOKEN` on Vercel, never paste it into ChatGPT.
- **AdSense**: Read-only diagnostics use the existing token. For the restricted display-unit mutation, `pnpm oauth -- --adsense --write` locally and store refresh token in `GOOGLE_ADSENSE_REFRESH_TOKEN`. Even with scope, most ordinary publisher projects cannot access this create method.
- If desired, use the least-privilege API scopes and only enable write functions you intend to call, under the ForgePulse tool allowlist.

## Official API references
- https://developers.google.com/adsense/management/reference/rest/v2/accounts.alerts/list
- https://developers.google.com/adsense/management/reference/rest/v2/accounts.payments/list
- https://developers.google.com/adsense/management/reference/rest/v2/accounts.policyIssues/list
- https://developers.google.com/adsense/management/reference/rest/v2/accounts.adclients.adunits/create
- https://developers.google.com/admob/api/reference/rest/v1beta/accounts.adUnits/create
- https://cloud.google.com/pubsub/docs/reference/rest/v1/projects.topics/create
- https://cloud.google.com/pubsub/docs/reference/rest/v1/projects.subscriptions/create
