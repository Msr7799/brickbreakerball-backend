/** Server-owned daily wallet rewards. Never derive eligibility from an Android clock. */
import {cert, getApps, initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {MongoClient, type Db} from 'mongodb';
import {NextRequest} from 'next/server';

const DAY_MS = 86_400_000;
// Bahrain uses UTC+03:00 all year and does not observe daylight saving time.
const BAHRAIN_OFFSET_MS = 3 * 3_600_000;
const COLLECTION = 'daily_rewards_v1';
const MAX_BODY = 1024;
let dbConnection: Promise<Db> | undefined;

export function rewardDay(now: number): number {
  return Math.floor((now + BAHRAIN_OFFSET_MS) / DAY_MS);
}
export function nextStreak(lastDay: number | undefined, previousStreak: number, today: number): number {
  return lastDay === today - 1 ? previousStreak % 14 + 1 : 1;
}
export function dayReward(day: number): {coins: number; gems: number} {
  if (!Number.isInteger(day) || day < 1 || day > 14) throw new Error('Invalid reward day');
  if (day === 7) return {coins: 1500, gems: 25};
  if (day === 14) return {coins: 2500, gems: 40};
  if ([3, 6, 10, 13].includes(day)) {
    return day === 10 || day === 13 ? {coins: 0, gems: day === 10 ? 5 : 7} : {coins: 120 + day * 30, gems: 2};
  }
  return {coins: 120 + day * 30, gems: day < 7 ? 1 : 0};
}
function app() {
  const existing = getApps().find(value => value.name === 'brickbreaker-daily-rewards');
  if (existing) return existing;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Missing Firebase service account');
  const key = JSON.parse(raw);
  return initializeApp({credential: cert(key)}, 'brickbreaker-daily-rewards');
}
async function authorizedUid(request: NextRequest): Promise<string | null> {
  const match = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(request.headers.get('authorization') || '');
  if (!match) return null;
  try { return (await getAuth(app()).verifyIdToken(match[1], true)).uid; }
  catch { return null; }
}
async function database(): Promise<Db> {
  if (!dbConnection) {
    const uri = process.env.MONGODB_URI;
    const name = process.env.MONGODB_DB;
    if (!uri || !name) throw new Error('Missing MongoDB configuration');
    const client = new MongoClient(uri, {maxPoolSize:5,serverSelectionTimeoutMS:6000});
    dbConnection = client.connect().then(conn => conn.db(name)).catch(e => { dbConnection=undefined; throw e; });
  }
  return dbConnection;
}
// Conditional single-document MongoDB update: atomic receipt and cumulative reward totals.
export async function dailyRewardResponse(request: NextRequest, claim: boolean): Promise<Response> {
  if (claim && request.headers.has('content-length') && Number(request.headers.get('content-length')) > MAX_BODY)
    return Response.json({ok:false,error:'invalid_request'}, {status:413});
  const uid = await authorizedUid(request);
  if (!uid) return Response.json({ok:false,error:'authentication_required'}, {status:401,headers:{'Cache-Control':'no-store'}});
  try {
    const today = rewardDay(Date.now());
    const col = (await database()).collection(COLLECTION);
    let granted = false;
    if (claim) {
      const last = await col.findOne({_id:uid as never});
      if (last?.lastClaimDay !== today) {
        const streakExpr = {$cond:[{$eq:['$lastClaimDay',today-1]},{$add:[{$mod:[{$ifNull:['$streak',0]},14]},1]},1]};
        const branches = Array.from({length:14},(_,i)=>({case:{$eq:[streakExpr,i+1]},then:dayReward(i+1)}));
        const coinsExpr = {$switch:{branches:branches.map(b=>({case:b.case,then:b.then.coins})),default:0}};
        const gemsExpr = {$switch:{branches:branches.map(b=>({case:b.case,then:b.then.gems})),default:0}};
        try {
          const result = await col.findOneAndUpdate(
            {_id:uid as never,lastClaimDay:{$ne:today}},
            [
              {$set:{streak:streakExpr,lastClaimDay:today,lastRewardCoins:coinsExpr,lastRewardGems:gemsExpr,lastClaimedAt:new Date()}},
              {$set:{totalAwardedCoins:{$add:[{$ifNull:['$totalAwardedCoins',0]},'$lastRewardCoins']},totalAwardedGems:{$add:[{$ifNull:['$totalAwardedGems',0]},'$lastRewardGems']}}}
            ],
            {upsert:true,returnDocument:'after'}
          );
          granted = result?.lastClaimDay === today;
        } catch (error) {
          if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)) throw error;
        }
      }
    }
    const record = await col.findOne({_id:uid as never});
    const lastClaimDay = typeof record?.lastClaimDay === 'number' ? record.lastClaimDay : null;
    const completed = typeof record?.streak === 'number' ? Math.max(0,Math.min(14,record.streak)) : 0;
    const claimedToday = lastClaimDay === today;
    const currentDay = claimedToday ? completed : nextStreak(lastClaimDay ?? undefined,completed,today);
    const date = new Date(today*DAY_MS).toISOString().slice(0,10);
    const lastReward = lastClaimDay === null ? null : {
      id:`${uid}:${lastClaimDay}`,
      coins:Number(record?.lastRewardCoins ?? 0),gems:Number(record?.lastRewardGems ?? 0),
      streak:completed,calendarDay:lastClaimDay
    };
    return Response.json({ok:true,timezone:'Asia/Bahrain',date,serverDay:today,
      nextResetAt:(today+1)*DAY_MS-BAHRAIN_OFFSET_MS,claimedToday,dayToClaim:currentDay,
      completedDays:claimedToday?completed:Math.max(0,currentDay-1),granted,lastReward},
      {headers:{'Cache-Control':'private, no-store'}});
  } catch (error) {
    console.error('Daily reward service failed:',error instanceof Error?error.name:'Error');
    return Response.json({ok:false,error:'service_unavailable'}, {status:503,headers:{'Cache-Control':'no-store'}});
  }
}
