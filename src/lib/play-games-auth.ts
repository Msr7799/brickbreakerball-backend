import {gameFirebaseAuth} from './game-firebase-auth';

const EXPECTED_CLIENT_ID = '6148685744-2gql3gj9l1q6d9167j47h4a4qtbvndnr.apps.googleusercontent.com';
const PROVIDER_ID = 'playgames.google.com';

export class InvalidPlayGamesCode extends Error {}

/** Exchange a one-use Play Games server code and resolve its player on Google's server. */
export async function firebaseTokenForPlayGamesCode(code: string): Promise<string> {
  const clientId = process.env.PLAY_GAMES_SERVER_CLIENT_ID;
  const clientSecret = process.env.PLAY_GAMES_SERVER_CLIENT_SECRET;
  if (clientId !== EXPECTED_CLIENT_ID || !clientSecret) throw new Error('Play Games server OAuth is not configured');
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({client_id: clientId, client_secret: clientSecret,
      code, grant_type: 'authorization_code', redirect_uri: ''}),
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (tokenResponse.status === 400 || tokenResponse.status === 401) throw new InvalidPlayGamesCode('Rejected Play Games authorization code');
  if (!tokenResponse.ok) throw new Error('Play Games token exchange unavailable');
  const token = await tokenResponse.json() as {access_token?: string};
  if (!token.access_token) throw new Error('Play Games access token missing');

  const playerResponse = await fetch('https://games.googleapis.com/games/v1/players/me', {
    headers: {Authorization: `Bearer ${token.access_token}`},
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (playerResponse.status === 401) throw new InvalidPlayGamesCode('Play Games player verification failed');
  if (!playerResponse.ok) throw new Error('Play Games player lookup unavailable');
  const player = await playerResponse.json() as {playerId?: string};
  if (!player.playerId || !/^[A-Za-z0-9_-]{1,120}$/.test(player.playerId))
    throw new Error('Invalid Play Games player identity');

  const auth = gameFirebaseAuth();
  let uid: string;
  try {
    // Preserve a Firebase account already linked through the Play Games provider.
    uid = (await auth.getUserByProviderUid(PROVIDER_ID, player.playerId)).uid;
  } catch (error) {
    if ((error as {code?: string}).code !== 'auth/user-not-found') throw error;
    uid = `pgs:${player.playerId}`;
  }
  return auth.createCustomToken(uid);
}
