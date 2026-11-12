import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/lib/play-games-auth.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022}}).outputText;
const clientId = '6148685744-2gql3gj9l1q6d9167j47h4a4qtbvndnr.apps.googleusercontent.com';

function loadBridge(fetch, auth) {
  const module = {exports: {}};
  vm.runInNewContext(javascript, {module, exports: module.exports, fetch, AbortSignal,
    URLSearchParams, process: {env: {PLAY_GAMES_SERVER_CLIENT_ID: clientId,
      PLAY_GAMES_SERVER_CLIENT_SECRET: 'test-secret'}},
    require: () => ({gameFirebaseAuth: () => auth})});
  return module.exports;
}

test('exchanges a single-use code, verifies the player, and preserves a linked Firebase UID', async () => {
  const calls = [];
  const auth = {
    getUserByProviderUid: async (provider, player) => {
      assert.equal(provider, 'playgames.google.com');
      assert.equal(player, 'player_42');
      return {uid: 'old-firebase-uid'};
    },
    createCustomToken: async uid => { assert.equal(uid, 'old-firebase-uid'); return 'signed-token'; },
  };
  const fetch = async (url, options) => {
    calls.push({url, options});
    if (calls.length === 1) return {status: 200, ok: true, json: async () => ({access_token: 'google-access'})};
    return {status: 200, ok: true, json: async () => ({playerId: 'player_42'})};
  };
  assert.equal(await loadBridge(fetch, auth).firebaseTokenForPlayGamesCode('one-use-code'), 'signed-token');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer google-access');
  assert.equal(calls[0].options.body.get('redirect_uri'), '');
});

test('rejects a bad Play Games code before issuing a Firebase token', async () => {
  const auth = {createCustomToken: () => { throw new Error('must not sign'); }};
  const fetch = async () => ({status: 400, ok: false});
  const bridge = loadBridge(fetch, auth);
  await assert.rejects(bridge.firebaseTokenForPlayGamesCode('bad-code'), bridge.InvalidPlayGamesCode);
});

test('new verified players receive a stable Firebase UID', async () => {
  const auth = {
    getUserByProviderUid: async () => { throw Object.assign(new Error('missing'), {code: 'auth/user-not-found'}); },
    createCustomToken: async uid => uid,
  };
  let count = 0;
  const fetch = async () => (++count % 2 === 1
    ? {status: 200, ok: true, json: async () => ({access_token: 'google-access'})}
    : {status: 200, ok: true, json: async () => ({playerId: 'player_42'})});
  const bridge = loadBridge(fetch, auth);
  assert.equal(await bridge.firebaseTokenForPlayGamesCode('first-code'), 'pgs:player_42');
  assert.equal(await bridge.firebaseTokenForPlayGamesCode('second-code'), 'pgs:player_42');
});
