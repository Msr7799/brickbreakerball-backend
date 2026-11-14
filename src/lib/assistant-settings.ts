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
const adminToolIds=defaults.toolIds.filter(id=>!preWriteToolIds.includes(id));
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
 // Only upgrade an untouched all-tools preset. Keep custom per-tool permissions unchanged.
 const storedIds=saved?.toolIds;
 const fullReadPreset=!!saved&&saved.schemaVersion===2&&!!storedIds&&storedIds.length===preWriteToolIds.length&&preWriteToolIds.every(id=>storedIds.includes(id));
 if(fullReadPreset){
  await collection.updateOne({_id:"main",schemaVersion:2,toolIds:{$size:preWriteToolIds.length}},
   {$addToSet:{toolIds:{$each:adminToolIds}},$set:{schemaVersion:3}});
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
