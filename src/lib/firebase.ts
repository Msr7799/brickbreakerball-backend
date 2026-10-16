import {cert,getApps,initializeApp} from "firebase-admin/app";
import {getDatabase} from "firebase-admin/database";
import {assertEnv,safeDatabasePath} from "./security";
function getFirebaseApp(){
 const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON||assertEnv("GOOGLE_SERVICE_ACCOUNT_JSON");
 let serviceAccount;
 try{serviceAccount=JSON.parse(raw);}catch{throw new Error("Invalid Firebase service-account JSON");}
 const name="forgepulse-mcp";
 return getApps().find(a=>a.name===name)||initializeApp({credential:cert(serviceAccount),databaseURL:assertEnv("FIREBASE_DATABASE_URL")},name);
}
/** Bounded read and positive connection probe, both constrained to the allowed subtree. */
export async function firebaseRead(path:string,limit:number):Promise<unknown>{
 const authorized=safeDatabasePath(path,process.env.FIREBASE_ALLOWED_PREFIX||"/mcp");
 const snap=await getDatabase(getFirebaseApp()).ref(authorized).limitToFirst(limit).get();
 return {path:authorized,exists:snap.exists(),value:snap.val()};
}
export async function firebaseProbe():Promise<{path:string;exists:boolean}>{
 const path=safeDatabasePath(process.env.FIREBASE_ALLOWED_PREFIX||"/mcp",process.env.FIREBASE_ALLOWED_PREFIX||"/mcp");
 const snap=await getDatabase(getFirebaseApp()).ref(path).limitToFirst(1).get();
 return {path,exists:snap.exists()};
}
