import type {Db} from "mongodb";
import {toolsMeta} from "./mcp-control";

const {db}=require("../../billing/lib/db.js") as {db:()=>Promise<Db>};
export type AssistantSettings={enabled:boolean;mcpEnabled:boolean;searchEnabled:boolean;toolIds:string[];updatedAt?:Date};
const defaults:AssistantSettings={enabled:true,mcpEnabled:true,searchEnabled:true,toolIds:toolsMeta.map(t=>t.id)};

export async function getAssistantSettings():Promise<AssistantSettings>{
 const saved=await (await db()).collection<AssistantSettings & {_id:string}>("assistant_settings").findOne({_id:"main"});
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
