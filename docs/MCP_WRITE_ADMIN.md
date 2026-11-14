# ForgePulse MCP administrative tools (Crashlytics / GA4)

These tools mutate Google/Firebase configuration. The underlying service account must be granted appropriate permissions by the owner. Granting roles alone never modifies player records or fixes app crashes.

## Tools

### Crashlytics (Firebase Crashlytics API v1alpha)
- `crashlytics_list_notes` - read issue notes
- `crashlytics_update_issue` - set `OPEN`, `CLOSED`, or `MUTED` (mutates issue state only)
- `crashlytics_create_note` - append a note (max 3000 characters)
- `crashlytics_delete_note` - permanently delete a specified note

These operations are scoped exclusively to the Android app selected by `FIREBASE_INSIGHTS_PROJECT_ID` and `ANDROID_PACKAGE_NAME`, using discovered or explicitly configured Firebase app ID.

### Google Analytics 4 (Analytics Admin API v1beta)
- `analytics_list_key_events` - list Key Events
- `analytics_create_key_event` - create a named Key Event with `ONCE_PER_EVENT` or `ONCE_PER_SESSION`
- `analytics_update_key_event` - change a Key Event's counting method
- `analytics_delete_key_event` - delete a specified Key Event

**Important:** GA4 Key Events are **property-wide** and affect every data stream in that GA4 property. Analytics historical events, sessions, users, and revenue cannot be retroactively edited through this interface. These tools do not modify Firebase SDK event instrumentation or game code.

## Required Google setup

1. Enable **Firebase Crashlytics API**, **Firebase Management API**, and **Google Analytics Admin API** in the appropriate Google Cloud project. Google Analytics Data API is independently required for reporting.
2. Give the service account in `FIREBASE_SERVICE_ACCOUNT_JSON` the predefined Firebase Crashlytics Admin role `roles/firebasecrashlytics.admin` for the Firebase project (plus permissions to discover the matching Firebase Android app).
3. Add that exact `client_email` service account as **Editor** or **Administrator** on the linked GA4 Property. Do not assign GA4 account-wide access unless necessary.
4. Set `FIREBASE_INSIGHTS_PROJECT_ID=brick-breaker-ball-8e4f5` for the game. Keep `GOOGLE_CLOUD_PROJECT_ID` unchanged: it is used by Google Play/RTDN.
5. Set `MCP_WRITE_ENABLED=true` on Vercel only after reviewing the grant, then deploy with that environment setting.
6. Reconnect ChatGPT to ForgePulse MCP and explicitly approve both `mcp:read` and `mcp:write` on the ForgePulse OAuth consent page. Old read-only tokens (and static bearer tokens) cannot write.

## Safety

- Each write action is separately allowlisted in `assistant_settings.toolIds`.
- Every ChatGPT MCP write tool requires a boolean `confirm:true` on the exact operation and an access token carrying `mcp:write`. The dashboard requires an authenticated admin session, same-origin request, `CONFIRM` typed in its dialog, and a second confirmation.
- A mandatory write-intent audit entry in MongoDB is stored before attempting the Google mutation; the final outcome is audited afterwards. If MongoDB is down, the write is blocked.
- No free-form Google API URLs, arbitrary Firebase database paths, or credentials are accepted from callers. All resource IDs are validated.
- Do not provide unbounded admin APIs, account deletion, user deletion, Google Play purchases, or remote-config writes through this gateway.

## Official API references
- https://firebase.google.com/docs/reference/crashlytics/rest/v1alpha/projects.apps.issues/patch
- https://firebase.google.com/docs/reference/crashlytics/rest/v1alpha/projects.apps.issues.notes/create
- https://firebase.google.com/docs/reference/crashlytics/rest/v1alpha/projects.apps.issues.notes/delete
- https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/properties.keyEvents
