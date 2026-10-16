import {cert,getApps,initializeApp} from "firebase-admin/app";
import {getDatabase} from "firebase-admin/database";
import {assertEnv,safeDatabasePath} from "./security";
export async function firebaseRead(path:string,limit:number):Promise<unknown>{
 const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON||assertEnv("GOOGLE_SERVICE_ACCOUNT_JSON");
 let serviceAccount;
 try{serviceAccount=JSON.parse(raw);}catch{throw new Error("Invalid Firebase service-account JSON");}
 if(!getApps().some(a=>a.name==="forgepulse-mcp"))initializeApp({credential:cert(serviceAccount),databaseURL:assertEnv("FIREBASE_DATABASE_URL")},"forgepulse-mcp");
 const authorized=safeDatabasePath(path,process.env.FIREBASE_ALLOWED_PREFIX||"/mcp");
 const snap=await getDatabase(getApps().find(a=>a.name==="forgepulse-mcp")!).ref(authorized).limitToFirst(limit).get();
 return {path:authorized,exists:snap.exists(),value:snap.val()};
}
