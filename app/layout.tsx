import type { ReactNode } from "react";
export const metadata = {title:"ForgePulse Google MCP", description:"Private Google services MCP gateway"};
export default function RootLayout({children}:{children:ReactNode}) {
  return <html lang="en"><body style={{margin:0,fontFamily:"system-ui,Arial,sans-serif",background:"#080d19",color:"#edf3ff"}}>{children}</body></html>;
}
