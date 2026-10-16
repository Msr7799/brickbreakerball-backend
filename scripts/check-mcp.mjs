const base=(process.argv[2]||process.env.MCP_SERVER_URL||"http://localhost:3000").replace(/\/$/,"");
const token=process.env.MCP_BEARER_TOKEN;
if(!token){console.error("Set MCP_BEARER_TOKEN in your terminal, then run: npm run test:mcp -- https://your-vercel-project.vercel.app");process.exit(1);}
const resp=await fetch(`${base}/api/mcp`,{
 method:"POST",
 headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json","Accept":"application/json, text/event-stream"},
 body:JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2025-06-18",capabilities:{},clientInfo:{name:"forgepulse-smoke-test",version:"1.0"}}})
});
console.log("HTTP",resp.status,"content-type",resp.headers.get("content-type"));
console.log((await resp.text()).slice(0,3000));
if(!resp.ok)process.exitCode=1;
