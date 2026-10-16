import {adaptBilling} from "../../../src/lib/billing-adapter";
import legacy from "../../../billing/api/webhook.js";
// Keep billing logic and cookies while deploying as a Next.js Route Handler.
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const POST=adaptBilling(legacy);
export const maxDuration=30;
