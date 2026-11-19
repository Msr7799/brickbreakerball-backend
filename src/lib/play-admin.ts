/** Google Play Developer API: scoped, reviewable changes to the configured game only. */
import {googleGet,googleRequest,googleToken} from "./google";
import {assertEnv} from "./security";
import {z} from "zod";
import type {Db} from "mongodb";

const {db}=require("../../billing/lib/db.js") as {db:()=>Promise<Db>};
const root=()=>`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(assertEnv("ANDROID_PACKAGE_NAME"))}`;
const editPath=(id:string)=>`${root()}/edits/${encodeURIComponent(id)}`;
const sessions=async()=> (await db()).collection<{
 _id:string;packageName:string;status:"open"|"committing"|"committed"|"uncertain";
 expiresAt:Date;createdAt:Date;updatedAt:Date;dirty:boolean;validatedAt:Date|null;
}>("mcp_play_edits");

export const playLanguage=z.string().trim().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/,"Use a locale such as en-US or ar");
export const playEditId=z.string().trim().min(4).max(120).regex(/^[A-Za-z0-9_-]+$/);
export const playImageType=z.enum(["phoneScreenshots","sevenInchScreenshots","tenInchScreenshots","tvScreenshots","wearScreenshots","icon","featureGraphic","tvBanner"]);
export const playListingFields=z.object({
 title:z.string().trim().min(1).max(30).optional(),
 shortDescription:z.string().trim().min(1).max(80).optional(),
 fullDescription:z.string().trim().min(1).max(4000).optional(),
 video:z.union([z.literal(""),z.string().url().max(500)]).optional()
}).refine(p=>Object.values(p).some(v=>v!==undefined),"Provide at least one field to change");
export const playDetailsFields=z.object({
 defaultLanguage:playLanguage.optional(),
 contactWebsite:z.union([z.literal(""),z.string().url().max(300)]).optional(),
 contactEmail:z.union([z.literal(""),z.email().max(200)]).optional(),
 contactPhone:z.string().max(40).optional()
}).refine(p=>Object.values(p).some(v=>v!==undefined),"Provide at least one contact field");

export async function playBeginEdit(){
 // An app edit is temporary and never publishes without an explicit commit.
 const response=await googleRequest(`${root()}/edits`,await googleToken("play"),"POST",{}) as {id?:string;expiryTimeSeconds?:string};
 if(!response.id||!response.expiryTimeSeconds)throw new Error("Google Play did not return an edit ID and expiration");
 const expiry=new Date(Number(response.expiryTimeSeconds)*1000);
 if(!Number.isFinite(expiry.getTime())||expiry.getTime()<=Date.now())throw new Error("Google Play returned an expired edit");
 await (await sessions()).insertOne({_id:response.id,packageName:assertEnv("ANDROID_PACKAGE_NAME"),status:"open",expiresAt:expiry,createdAt:new Date(),updatedAt:new Date(),dirty:false,validatedAt:null});
 return {editId:response.id,expiresAt:expiry.toISOString(),status:"open",note:"Draft only. Nothing has been published."};
}

async function assertEdit(editId:string,requireOpen=false){
 const id=playEditId.parse(editId);
 const doc=await (await sessions()).findOne({_id:id,packageName:assertEnv("ANDROID_PACKAGE_NAME"),expiresAt:{$gt:new Date()}});
 if(!doc||doc.status!=="open")throw new Error("Edit is missing, expired, or already committed. Begin a new edit.");
 if(requireOpen&&doc.status!=="open")throw new Error("Edit is not open");
 return doc;
}
async function markDirty(editId:string){
 await (await sessions()).updateOne({_id:editId,status:"open"},{$set:{dirty:true,validatedAt:null,updatedAt:new Date()}});
}
export async function playListListings(editId:string){await assertEdit(editId);return googleGet(`${editPath(editId)}/listings`,await googleToken("play"));}
export async function playGetListing(editId:string,language:string){await assertEdit(editId);return googleGet(`${editPath(editId)}/listings/${encodeURIComponent(playLanguage.parse(language))}`,await googleToken("play"));}
export async function playPatchListing(editId:string,language:string,fields:unknown){
 await assertEdit(editId,true);const payload=playListingFields.parse(fields);
 const response=await googleRequest(`${editPath(editId)}/listings/${encodeURIComponent(playLanguage.parse(language))}`,await googleToken("play"),"PATCH",payload);
 await markDirty(editId);return {editId,language,listing:response,staged:true};
}
export async function playGetDetails(editId:string){await assertEdit(editId);return googleGet(`${editPath(editId)}/details`,await googleToken("play"));}
export async function playPatchDetails(editId:string,fields:unknown){
 await assertEdit(editId,true);const response=await googleRequest(`${editPath(editId)}/details`,await googleToken("play"),"PATCH",playDetailsFields.parse(fields));
 await markDirty(editId);return {editId,details:response,staged:true};
}
export async function playListImages(editId:string,language:string,imageType:string){
 await assertEdit(editId);return googleGet(`${editPath(editId)}/listings/${encodeURIComponent(playLanguage.parse(language))}/${playImageType.parse(imageType)}`,await googleToken("play"));
}
export async function playDeleteImage(editId:string,language:string,imageType:string,imageId:string){
 await assertEdit(editId,true);
 const id=z.string().min(1).max(300).regex(/^[A-Za-z0-9_-]+$/).parse(imageId);
 await googleRequest(`${editPath(editId)}/listings/${encodeURIComponent(playLanguage.parse(language))}/${playImageType.parse(imageType)}/${encodeURIComponent(id)}`,await googleToken("play"),"DELETE");
 await markDirty(editId);return {editId,imageId:id,stagedDeletion:true};
}

export function validatePlayImage(bytes:Buffer,mimeType:string){
 if(bytes.length<8||bytes.length>4*1024*1024)throw new Error("Image must be between 8 bytes and 4 MB (Vercel upload limit)");
 const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpeg=bytes.subarray(0,3).equals(Buffer.from([255,216,255]));
 if((mimeType==="image/png"&&!png)||(mimeType==="image/jpeg"&&!jpeg)||(!png&&!jpeg))throw new Error("Only genuine PNG or JPEG images are accepted");
 if(!["image/png","image/jpeg"].includes(mimeType))throw new Error("Only PNG and JPEG media types are accepted");
 return bytes;
}

export async function playUploadImage(editId:string,language:string,imageType:string,bytes:Buffer,mimeType:string){
 await assertEdit(editId,true);validatePlayImage(bytes,mimeType);
 const path=`${root().replace("https://androidpublisher.googleapis.com/","https://androidpublisher.googleapis.com/upload/")}/edits/${encodeURIComponent(editId)}/listings/${encodeURIComponent(playLanguage.parse(language))}/${playImageType.parse(imageType)}`;
 const url=new URL(path);url.searchParams.set("uploadType","media");
 const token=await googleToken("play");const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),35000);
 let response:Response;
 try{response=await fetch(url,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":mimeType,Accept:"application/json"},body:new Uint8Array(bytes),cache:"no-store",signal:controller.signal});}
 finally{clearTimeout(timeout);}
 const text=await response.text();let data:unknown;
 try{data=JSON.parse(text);}catch{data={message:text.slice(0,400)};}
 if(!response.ok){const error=data as {error?:{message?:string}};throw new Error(`Google Play image upload HTTP ${response.status}: ${error.error?.message?.slice(0,400)||"Upload rejected"}`);}
 await markDirty(editId);return {editId,language,imageType,uploaded:data,staged:true};
}

export async function playListTracks(editId:string){await assertEdit(editId);return googleGet(`${editPath(editId)}/tracks`,await googleToken("play"));}
export async function playGetTrack(editId:string,track:string){
 await assertEdit(editId);const name=z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/).parse(track);
 return googleGet(`${editPath(editId)}/tracks/${encodeURIComponent(name)}`,await googleToken("play"));
}
export async function playValidateEdit(editId:string){
 await assertEdit(editId);const result=await googleRequest(`${editPath(editId)}:validate`,await googleToken("play"),"POST");
 await (await sessions()).updateOne({_id:editId,status:"open"},{$set:{validatedAt:new Date(),updatedAt:new Date()}});
 return {editId,valid:true,validation:result,note:"Validation did not publish anything."};
}
export async function playCommitEdit(editId:string){
 const doc=await assertEdit(editId,true);
 if(!doc.dirty||!doc.validatedAt)throw new Error("Stage a change and run play_validate_edit before committing");
 const collection=await sessions();
 const claimed=await collection.updateOne({_id:editId,status:"open",dirty:true,validatedAt:{$ne:null}},{$set:{status:"committing",updatedAt:new Date()}});
 if(claimed.modifiedCount!==1)throw new Error("This edit is already being committed");
 try{
  // ERROR_IF_IN_REVIEW avoids cancelling a user's existing Google Play review.
  const result=await googleRequest(`${editPath(editId)}:commit`,await googleToken("play"),"POST",undefined,{changesInReviewBehavior:"ERROR_IF_IN_REVIEW"});
  await collection.updateOne({_id:editId},{$set:{status:"committed",updatedAt:new Date()}});
  return {editId,committed:true,result,note:"Changes submitted to Google Play; review/publication timing is controlled by Google."};
 }catch(error){
  // Network failures are ambiguous: never blindly re-submit an edit that may have committed.
  await collection.updateOne({_id:editId},{$set:{status:"uncertain",updatedAt:new Date()}});
  throw error;
 }
}
export async function playReplyReview(reviewId:string,replyText:string){
 const id=z.string().min(1).max(300).regex(/^[A-Za-z0-9_-]+$/).parse(reviewId);
 const body=z.string().trim().min(1).max(350).parse(replyText);
 return googleRequest(`${root()}/reviews/${encodeURIComponent(id)}:reply`,await googleToken("play"),"POST",{replyText:body});
}

/** Diagnostic creates and deletes an unpublished, empty edit; never writes a live listing. */
export async function playAccessDiagnostic(){
 const started=Date.now();const token=await googleToken("play");
 const response=await googleRequest(`${root()}/edits`,token,"POST",{}) as {id?:string};
 if(!response.id)throw new Error("Google Play did not return a test edit ID");
 try{
  const [listings,details,tracks]=await Promise.all([
   googleGet(`${editPath(response.id)}/listings`,token),googleGet(`${editPath(response.id)}/details`,token),googleGet(`${editPath(response.id)}/tracks`,token)
  ]);
  return {ok:true,packageName:assertEnv("ANDROID_PACKAGE_NAME"),durationMs:Date.now()-started,
   checks:{googleToken:"ok",createTemporaryEdit:"ok",listings:"ok",details:"ok",tracks:"ok"},
   listingCount:(listings as {listings?:unknown[]}).listings?.length??0,
   trackCount:(tracks as {tracks?:unknown[]}).tracks?.length??0,
   detailsPresent:!!details,note:"Read tests only; temporary edit discarded. Write permission is confirmed only by a staged mutation."};
 }finally{await googleRequest(`${editPath(response.id)}`,token,"DELETE").catch(()=>{});}
}
