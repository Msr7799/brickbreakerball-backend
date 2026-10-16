import {adaptBilling} from "../../../src/lib/billing-adapter";
import legacy from "../../../billing/api/logout.js";
// Keep billing logic and cookies while deploying as a Next.js Route Handler.
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const POST=adaptBilling(legacy);
