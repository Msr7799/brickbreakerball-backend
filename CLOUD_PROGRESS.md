# Release cloud progress

`GET /api/progress` reads the verified Firebase player's current checkpoint. `PUT /api/progress` accepts `{baseRevision, saveId, snapshot}`. There is no client-supplied account selector. Both methods verify the Firebase ID token with revocation checking, using the same game Firebase project as daily rewards.

Storage reuses `MONGODB_URI`, `MONGODB_DB` and `GAME_FIREBASE_SERVICE_ACCOUNT_JSON`. No new client SDK, Firebase security rule or secret is needed. Production data is in `player_progress_v1`, keyed by the authenticated Firebase UID. One previous checkpoint is retained in the same document for recovery. Snapshots are limited to 1 MiB and explicitly allowed typed preference sections. Authentication tokens are never included in them.

## Conflict and retry behavior

- A new document requires revision 0. A write atomically replaces only the matching `_id` and previous revision, returning the next revision.
- Repeating the same `saveId` and snapshot returns its existing revision without granting or incrementing anything.
- A stale revision returns HTTP 409 and the current checkpoint. The Android client preserves local data and asks which coherent save to keep; consumable balances are never added together.
- Before any upload, the client reads cloud state. A fresh install restores it before normal entry. Offline edits stay local and retry later. A lost write acknowledgement is reconciled using the persistent pending save ID before retrying.
- Restores are validated completely, journaled and applied at a startup/menu boundary. A restore interrupted between preference files completes from the journal before creating player stores on the next launch.
- On account changes, local copies are retained per account. Another player's current local data is never uploaded into the newly connected account.
- Play Games identity is reverified on process start and explicit reconnection; a cached Firebase session alone is not accepted as proof of the currently selected Play Games player.

The snapshot includes campaign data, all difficulties' stars/scores, owned and selected balls, orb copies and loadouts, items, wallet plus receipts, purchase ledger, tutorial state and pending reward reveal. Paused in-flight physics, ad consent/counters, developer access and auth credentials remain device-local. A restored profile resumes from campaign progress rather than restoring another device's in-flight shot.

## Validation

```powershell
pnpm typecheck
pnpm exec node --test tests/cloud-progress.test.mjs tests/play-games-auth.test.mjs tests/daily-rewards.test.mjs
pnpm build
```

`scripts/check-cloud-progress-mongo.mjs` optionally exercises the actual MongoDB write function using a generated synthetic ID in `cloud_progress_fixtures_v1`. It deletes only its own fixture in `finally`. Supply credentials through an existing environment file; never print tokens or service account keys.

The pre-existing broad MCP structure test expects 16 tools while the current main branch registers 23; this is separate from progress persistence. Do not describe the full suite as passing until that unrelated baseline is updated.

Android source tests are in `CloudProgressSyncTest.kt`. They require the next explicitly authorized Android test/build gate. This implementation session does not compile or launch the Android app.

## Operations

Clients need a new Android Release build containing the integration; deploying the API does not update already installed APKs. Only changes that successfully synchronized can be recovered after uninstall. Local data deleted before this feature had no cloud copy and cannot be recreated by the new endpoint.

Account data deletion requests must also remove `player_progress_v1` records (including the embedded previous checkpoint) for the verified UID, in addition to applicable reward and account records. The privacy policy describes these account backups and their retention.
