const services=["Firebase Realtime Database","Google Play Console","Google Cloud & Pub/Sub","Google AdMob","Google AdSense"];
export default function Home(){return <main style={{maxWidth:780,margin:"70px auto",padding:24}}>
 <div style={{color:"#70d9d5",fontWeight:700,letterSpacing:3}}>FORGEPULSE</div>
 <h1>MCP Gateway</h1><p>15 private read-only Google tools with audit logs and connection checks. The endpoint is protected by a secret bearer token.</p>
 <pre style={{background:"#141f33",borderRadius:12,padding:20,overflowX:"auto",color:"#9bd6ff"}}>POST /api/mcp</pre>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12,marginTop:26}}>{services.map(s=><div key={s} style={{background:"#121c2e",border:"1px solid #27364d",borderRadius:10,padding:16}}>{s}</div>)}</div>
 <p><a href="/mcp-dashboard" style={{color:"#88ab60",fontWeight:700}}>افتح لوحة ForgePulse MCP الجديدة ←</a></p><p style={{fontSize:13,color:"#8095b3",marginTop:35}}>Never share OAuth refresh tokens, private keys or MCP bearer tokens.</p>
 </main>}
