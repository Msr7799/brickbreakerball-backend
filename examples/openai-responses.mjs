/** Run with OPENAI_API_KEY, MCP_SERVER_URL, MCP_BEARER_TOKEN set. */
import OpenAI from "openai";
const client=new OpenAI();
if(!process.env.MCP_SERVER_URL||!process.env.MCP_BEARER_TOKEN)throw new Error("Set MCP_SERVER_URL and MCP_BEARER_TOKEN");
const response=await client.responses.create({
 model:process.env.OPENAI_MODEL||"gpt-6",
 input:"Check which of my Google services are configured. Do not request or reveal credentials.",
 tools:[{type:"mcp",server_label:"forgepulse_google",server_url:process.env.MCP_SERVER_URL.replace(/\/$/,"")+"/api/mcp",authorization:process.env.MCP_BEARER_TOKEN,require_approval:"always"}]
});
console.log(response.output_text||JSON.stringify(response.output,null,2));
