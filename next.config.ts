import type {NextConfig} from "next";
const nextConfig:NextConfig={
 async headers(){return [
  {source:"/dashboard.html",headers:[{key:"Cache-Control",value:"no-store"},{key:"X-Frame-Options",value:"DENY"},{key:"Referrer-Policy",value:"no-referrer"},{key:"Content-Security-Policy",value:"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'"}]},
  {source:"/api/:path*",headers:[{key:"Cache-Control",value:"no-store"},{key:"X-Content-Type-Options",value:"nosniff"},{key:"Referrer-Policy",value:"no-referrer"}]}
 ];}
};
export default nextConfig;
