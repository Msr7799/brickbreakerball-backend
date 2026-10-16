export const runtime="nodejs";
export const dynamic="force-dynamic";
export function GET(){return Response.json({ok:true,service:"Brick Breaker Ball Unified Backend",dashboard:"/dashboard.html",billingWebhook:"/api/webhook",mcp:"/api/mcp",deployed:true},{headers:{"Cache-Control":"no-store"}});}
