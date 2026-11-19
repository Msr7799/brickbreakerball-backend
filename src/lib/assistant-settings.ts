import type {Db} from "mongodb";
import {toolsMeta} from "./mcp-control";

const {db}=require("../../billing/lib/db.js") as {db:()=>Promise<Db>};
export type AssistantSettings={enabled:boolean;mcpEnabled:boolean;searchEnabled:boolean;toolIds:string[];updatedAt?:Date};
const defaults:AssistantSettings={enabled:true,mcpEnabled:true,searchEnabled:true,toolIds:toolsMeta.map(t=>t.id)};

/** The original 16-tool allowlist, before Crashlytics and GA4 tools were added. */
const originalToolIds=[
 "tavily_search","gateway_status","firebase_read","play_list_reviews",
 "play_list_one_time_products","play_list_subscriptions","cloud_get_project",
 "cloud_list_pubsub_topics","cloud_list_pubsub_subscriptions","admob_list_accounts",
 "admob_list_apps","admob_list_ad_units","admob_network_report",
 "adsense_list_accounts","adsense_list_sites","adsense_report"
];
const preWriteToolIds=[...originalToolIds,
 "crashlytics_list_reports","crashlytics_get_report","crashlytics_get_issue","crashlytics_list_events",
 "analytics_overview","analytics_top_events","analytics_app_versions"
];
const preWriteAdditions=preWriteToolIds.filter(id=>!originalToolIds.includes(id));
const initialAdminToolIds=[
 "crashlytics_list_notes","crashlytics_update_issue","crashlytics_create_note","crashlytics_delete_note",
 "analytics_list_key_events","analytics_create_key_event","analytics_update_key_event","analytics_delete_key_event"
];
const adminToolIds=initialAdminToolIds;
const beforeMonetizationToolIds=[...preWriteToolIds,...initialAdminToolIds];
const playStoreToolIds=["play_access_diagnostic","play_begin_edit","play_list_store_listings","play_get_store_listing","play_get_app_details","play_list_store_images","play_list_tracks","play_get_track","play_update_store_listing","play_update_app_details","play_upload_store_image","play_delete_store_image","play_validate_edit","play_commit_edit","play_reply_review"];
const monetizationToolIds=defaults.toolIds.filter(id=>!beforeMonetizationToolIds.includes(id)&&!playStoreToolIds.includes(id));
const previousCatalogIds=defaults.toolIds.filter(id=>!playStoreToolIds.includes(id));
export async function getAssistantSettings():Promise<AssistantSettings>{
 const collection=(await db()).collection<AssistantSettings & {_id:string;schemaVersion?:number}>("assistant_settings");
 let saved=await collection.findOne({_id:"main"});
 // One-time upgrade only for users who enabled *every* original tool.
 // Respect hand-picked allowlists and never re-enable subsequently disabled tools.
 const previousIds=saved?.toolIds;
 const isFullLegacy=!!saved&&saved.schemaVersion===undefined&&previousIds?.length===originalToolIds.length&&originalToolIds.every(id=>previousIds.includes(id));
 if(isFullLegacy){
  await collection.updateOne({_id:"main",schemaVersion:{$exists:false},toolIds:{$size:originalToolIds.length}},{
   $addToSet:{toolIds:{$each:preWriteAdditions}},$set:{schemaVersion:2}
  });
  saved=await collection.findOne({_id:"main"});
 }
 // Upgrade an untouched original 16-tool preset directly to the current full catalog.
 // This also repairs installations where an older schemaVersion was persisted before
 // the staged migrations completed. Never change a custom selection.
 const legacyIds=saved?.toolIds;
 const untouchedOriginalPreset=!!saved&&!!legacyIds&&legacyIds.length===originalToolIds.length&&
  originalToolIds.every(id=>legacyIds.includes(id))&&
  (saved.schemaVersion===undefined||saved.schemaVersion===2||saved.schemaVersion===3||saved.schemaVersion===4);
 if(untouchedOriginalPreset){
  await collection.updateOne({_id:"main",toolIds:{$size:originalToolIds.length},
   ...(saved?.schemaVersion===undefined?{schemaVersion:{$exists:false}}:{schemaVersion:saved?.schemaVersion})},
   {$addToSet:{toolIds:{$each:defaults.toolIds}},$set:{schemaVersion:5}});
  saved=await collection.findOne({_id:"main"});
 }
 // Only upgrade an untouched all-tools preset. Keep custom per-tool permissions unchanged.
 const storedIds=saved?.toolIds;
 const fullReadPreset=!!saved&&saved.schemaVersion===2&&!!storedIds&&storedIds.length===preWriteToolIds.length&&preWriteToolIds.every(id=>storedIds.includes(id));
 if(fullReadPreset){
  await collection.updateOne({_id:"main",schemaVersion:2,toolIds:{$size:preWriteToolIds.length}},
   {$addToSet:{toolIds:{$each:adminToolIds}},$set:{schemaVersion:3}});
  saved=await collection.findOne({_id:"main"});
 }
 // Upgrade only the untouched 31-tool all-enabled preset. Never alter custom allowlists.
 const existingIds=saved?.toolIds;
 const fullAdminPreset=!!saved&&saved.schemaVersion===3&&!!existingIds&&
  existingIds.length===beforeMonetizationToolIds.length&&beforeMonetizationToolIds.every(id=>existingIds.includes(id));
 if(fullAdminPreset){
  await collection.updateOne({_id:"main",schemaVersion:3,toolIds:{$size:beforeMonetizationToolIds.length}},
   {$addToSet:{toolIds:{$each:monetizationToolIds}},$set:{schemaVersion:4}});
  saved=await collection.findOne({_id:"main"});
 }
 // Bring the new Play API tools into an untouched, full v4 installation.
 // Custom allowlists (even a single tool intentionally disabled) are never expanded.
 const v4Ids=saved?.toolIds;
 const fullV4Preset=!!saved&&saved.schemaVersion===4&&!!v4Ids&&
  v4Ids.length===previousCatalogIds.length&&previousCatalogIds.every(id=>v4Ids.includes(id));
 if(fullV4Preset){
  await collection.updateOne({_id:"main",schemaVersion:4,toolIds:{$size:previousCatalogIds.length}},
   {$addToSet:{toolIds:{$each:playStoreToolIds}},$set:{schemaVersion:5}});
  saved=await collection.findOne({_id:"main"});
 }
 return {...defaults,...saved,toolIds:saved?.toolIds??defaults.toolIds};
}
export async function saveAssistantSettings(patch:Partial<Pick<AssistantSettings,"enabled"|"mcpEnabled"|"searchEnabled"|"toolIds">>):Promise<AssistantSettings>{
 const update:Partial<AssistantSettings>={};
 for(const key of ["enabled","mcpEnabled","searchEnabled"] as const)if(typeof patch[key]==="boolean")update[key]=patch[key];
 if(Array.isArray(patch.toolIds))update.toolIds=[...new Set(patch.toolIds.filter(id=>toolsMeta.some(t=>t.id===id)))];
 update.updatedAt=new Date();
 await (await db()).collection<AssistantSettings & {_id:string}>("assistant_settings").updateOne({_id:"main"},{$set:update},{upsert:true});
 return getAssistantSettings();
}
export function allowedTool(id:string,settings:AssistantSettings){return settings.enabled&&settings.mcpEnabled&&(id!=="tavily_search"||settings.searchEnabled)&&settings.toolIds.includes(id);}
