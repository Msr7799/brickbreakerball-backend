import {cert, getApps, initializeApp, type ServiceAccount} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';

const FIREBASE_PROJECT_ID = 'brick-breaker-ball-8e4f5';
const APP_NAME = 'brickbreaker-game-auth';

/** Player tokens and daily rewards must use the Firebase project shipped in Android. */
export function gameFirebaseAuth() {
  const existing = getApps().find(app => app.name === APP_NAME);
  if (existing) return getAuth(existing);
  const raw = process.env.GAME_FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Missing game Firebase service account');
  const key = JSON.parse(raw) as ServiceAccount & {project_id?: string};
  if (key.project_id !== FIREBASE_PROJECT_ID) throw new Error('Wrong game Firebase project');
  return getAuth(initializeApp({credential: cert(key)}, APP_NAME));
}
