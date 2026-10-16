import type { ReactNode } from "react";
export const metadata = {title:"ForgePulse MCP | Brick Breaker Ball", description:"Private MCP services command center and Google Play purchase notifications"};
export default function RootLayout({children}:{children:ReactNode}) {
  return <html lang="ar" dir="rtl"><body style={{margin:0,fontFamily:'system-ui,"Segoe UI",Arial,sans-serif'}}>{children}</body></html>;
}
