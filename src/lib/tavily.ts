import {reserveTavily} from "./assistant-quota";

export async function searchTavily(query:string){
 const key=process.env.TAVILY_API_KEY?.trim();if(!key||key.startsWith("REPLACE_"))throw new Error("مفتاح Tavily غير مضبوط على السيرفر.");
 await reserveTavily();const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{const response=await fetch("https://api.tavily.com/search",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},body:JSON.stringify({query:query.slice(0,500),search_depth:"basic",max_results:5,include_answer:false,include_raw_content:false}),signal:controller.signal});if(!response.ok)throw new Error(`Tavily HTTP ${response.status}`);
  const data=await response.json() as {results?:{title?:string;url?:string;content?:string}[]};return (data.results||[]).filter(x=>{try{return ["http:","https:"].includes(new URL(x.url||"").protocol);}catch{return false;}}).slice(0,5).map(x=>({title:(x.title||x.url||"").slice(0,120),url:x.url!,content:(x.content||"").slice(0,1000)}));
 }finally{clearTimeout(timer);}
}
