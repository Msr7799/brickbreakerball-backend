import {MongoClient, type Collection, type Db} from 'mongodb';
import {NextRequest} from 'next/server';
import {gameFirebaseAuth} from './game-firebase-auth';
import {InvalidProgress, MAX_PROGRESS_BYTES, parseProgressCommand, type ProgressCommand, type ProgressSnapshot} from './cloud-progress-contract';

type Checkpoint = {_id:string;revision:number;saveId:string;snapshot:ProgressSnapshot;updatedAt:number;previous?:{revision:number;snapshot:ProgressSnapshot;updatedAt:number}};
let dbConnection:Promise<Db>|undefined;
async function database(){
  if(!dbConnection){
    const uri=process.env.MONGODB_URI,name=process.env.MONGODB_DB;
    if(!uri || !name) throw new Error('Cloud progress database is not configured');
    const client=new MongoClient(uri,{maxPoolSize:5,serverSelectionTimeoutMS:6000});
    dbConnection=client.connect().then(c=>c.db(name)).catch(error=>{dbConnection=undefined;throw error;});
  }
  return dbConnection;
}
export function publicCheckpoint(record:Checkpoint|null){
  return record?{revision:record.revision,saveId:record.saveId,snapshot:record.snapshot,updatedAt:record.updatedAt}:{revision:0,saveId:'',snapshot:null,updatedAt:0};
}
/** Compare-and-swap prevents a stale device or a timed-out retry replacing a newer save. */
export async function writeCheckpoint(collection:Collection<Checkpoint>,uid:string,command:ProgressCommand,now=Date.now()){
  const previous=await collection.findOne({_id:uid});
  if(previous?.saveId===command.saveId){
    if(JSON.stringify(previous.snapshot)!==JSON.stringify(command.snapshot)) return {conflict:true,record:previous};
    return {conflict:false,record:previous};
  }
  if((previous?.revision??0)!==command.baseRevision) return {conflict:true,record:previous};
  const next:Checkpoint={_id:uid,revision:command.baseRevision+1,saveId:command.saveId,snapshot:command.snapshot,updatedAt:now};
  if(previous) next.previous={revision:previous.revision,snapshot:previous.snapshot,updatedAt:previous.updatedAt};
  try{
    if(!previous) await collection.insertOne(next);
    else {
      const result=await collection.replaceOne({_id:uid,revision:command.baseRevision},next);
      if(result.matchedCount!==1) return {conflict:true,record:await collection.findOne({_id:uid})};
    }
  }catch(error){
    if((error as {code?:number}).code!==11000) throw error;
    return {conflict:true,record:await collection.findOne({_id:uid})};
  }
  return {conflict:false,record:next};
}
async function readBody(request:NextRequest){
  if(Number(request.headers.get('content-length')??0)>MAX_PROGRESS_BYTES) throw new InvalidProgress();
  if(!request.body) throw new InvalidProgress();
  const reader=request.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_PROGRESS_BYTES){await reader.cancel();throw new InvalidProgress();}chunks.push(value);}}
  finally{reader.releaseLock();}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new InvalidProgress();}
}
export async function cloudProgressResponse(request:NextRequest,write:boolean){
  const headers={'Cache-Control':'private, no-store'};
  try{
    const match=/^Bearer ([A-Za-z0-9_.-]+)$/.exec(request.headers.get('authorization')??'');
    if(!match) return Response.json({ok:false,error:'authentication_required'},{status:401,headers});
    let uid:string;
    try{uid=(await gameFirebaseAuth().verifyIdToken(match[1],true)).uid;}
    catch{return Response.json({ok:false,error:'authentication_required'},{status:401,headers});}
    const command=write?parseProgressCommand(await readBody(request)):null;
    const collection=(await database()).collection<Checkpoint>('player_progress_v1');
    if(command){
      const result=await writeCheckpoint(collection,uid,command);
      return Response.json({ok:!result.conflict,...publicCheckpoint(result.record),...(result.conflict?{error:'save_conflict'}:{})},{status:result.conflict?409:200,headers});
    }
    return Response.json({ok:true,...publicCheckpoint(await collection.findOne({_id:uid}))},{headers});
  }catch(error){
    if(error instanceof InvalidProgress) return Response.json({ok:false,error:'invalid_checkpoint'},{status:400,headers});
    console.error('Cloud progress failed',error instanceof Error?error.name:'Error');
    return Response.json({ok:false,error:'service_unavailable'},{status:503,headers});
  }
}
