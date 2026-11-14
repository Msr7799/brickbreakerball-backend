# Crashlytics + GA4 for ForgePulse MCP\n\nFor the approved administrative tools added later, see [MCP_WRITE_ADMIN.md](MCP_WRITE_ADMIN.md).

The seven original MCP insights tools are **read-only** and reuse `mcp:read`, ForgePulse dashboard login, the MCP tool allowlist, and MongoDB `mcp_audit` logging.

## Crashlytics tools
- `crashlytics_list_reports`: list supported reports and their exact `reportId` names.
- `crashlytics_get_report`: fetch the named report, with `hours=24` and optionally `version="2.9.0 (26)"`. Use `topIssues` only if returned in the list.
- `crashlytics_get_issue`: fetch metadata for an issue ID found in a report.
- `crashlytics_list_events`: fetch recent events for an issue, with bounded page sizes and an optional version filter.

The Crashlytics API is `v1alpha`. The official reports endpoint exposes issue groupings and crash-free user/session metrics; it does not expose a general `issues.list`. Report results are **not** fabricated if there is no data or the API denies access.

## Firebase Analytics / GA4 tools
- `analytics_overview`: per-day active users, new users, sessions and event counts.
- `analytics_top_events`: event names, event counts and active users.
- `analytics_app_versions`: activity grouped by app version.

Analytics uses the GA4 Data API and attempts to filter to the Firebase Android stream to avoid mixing metrics from other linked apps. The response says whether that stream filter was available.

## Server configuration
Existing variables: `FIREBASE_SERVICE_ACCOUNT_JSON` (preferred; fallback: `GOOGLE_SERVICE_ACCOUNT_JSON`) and `ANDROID_PACKAGE_NAME`.

Set `FIREBASE_INSIGHTS_PROJECT_ID=brick-breaker-ball-8e4f5` for this game. This is a different Firebase project from the Google Cloud RTDN project `brickbreakerball-508820`; **do not** overwrite `GOOGLE_CLOUD_PROJECT_ID` used for purchases and Pub/Sub. The Firebase insights code uses Firebase credentials independently from Google Play/Cloud tools.

Optional: `FIREBASE_ANDROID_APP_ID`, `GA4_PROPERTY_ID`, and `GA4_ANDROID_STREAM_ID` (when Firebase stream mapping cannot be discovered). If the Android stream ID is unknown, analytics requests fail rather than returning a mixture of other apps' data. When omitted, Firebase Management API discovers the Android app by package name and the GA4 property from `projects.getAnalyticsDetails`.

Required access:
1. Enable Firebase Management API, Firebase Crashlytics API, and Google Analytics Data API in Google Cloud (when applicable).
2. Assign the Firebase service account the read-only **Firebase Crashlytics Viewer** IAM role (`roles/firebasecrashlytics.viewer`) in project `brick-breaker-ball-8e4f5`, plus minimum required Firebase project app-discovery permission.
3. Add the service account email as a **Viewer** to the linked GA4 property. If GA4 is not linked to Firebase, configure that link before using the auto-discovery path.
4. In ForgePulse assistant settings, enable the new tool IDs if the stored MCP allowlist has explicitly selected tools. A list of tools on the page does not override that allowlist.
5. Run the new service connection checks, then test a 24-hour Crashlytics report filtered to `2.9.0 (26)`.

## Security
- No Google tokens, private keys, service-account JSON, Firebase user IDs or authentication headers are exposed by status endpoints.
- MCP tools use existing OAuth `mcp:read` or bearer authentication.
- Google API requests use fixed Google endpoints with validated IDs, dates and page sizes.
- The dashboard runs tools only for an authenticated session and enforces origin checks.
- Calls are audited in `mcp_audit`; no mutations to game, accounts, issues, or Firebase records.

Official API references:
- https://firebase.google.com/docs/reference/crashlytics/rest/v1alpha/projects.apps.reports/list
- https://firebase.google.com/docs/reference/crashlytics/rest/v1alpha/projects.apps.reports/get
- https://firebase.google.com/docs/reference/crashlytics/rest/v1alpha/projects.apps.events/list
- https://firebase.google.com/docs/reference/firebase-management/rest/v1beta1/projects/getAnalyticsDetails
- https://developers.google.com/analytics/devguides/reporting/data/v1
