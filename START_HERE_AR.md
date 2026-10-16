# Brick Breaker Ball: ابدأ من هني 🧩

هالنسخة **موحّدة**: لوحة مشتريات الجواهر وواجهة Google MCP في **مشروع Vercel واحد**. ما تحتاج build خاص لـ Node.js القديم. الحين صرنا Next.js لذلك عندنا `pnpm build`.

## 1) افتح المشروع في VS Code

1. فك ضغط ZIP في مجلد جديد (احتفظ بنسخة من مشروعك القديم).
2. افتح المجلد الجذر `BrickBreakerBall-Unified-Vercel` في VS Code.
3. افتح Terminal وشغّل:

```powershell
node -v
pnpm install
pnpm test
pnpm build
```

لازم Node.js 20.9+ (يُفضّل 22). إذا شفت تحذير ignored build scripts لبعض الحزم، لا تسمح بتشغيل سكربتات عشوائية تلقائياً؛ راجع أسماء الحزم أولاً.

**للتشغيل محلياً:**

```powershell
Copy-Item .env.example .env.local
pnpm dev
```

`http://localhost:3000` يحوّلك للوحة المشتريات. قد تحتاج MongoDB وكلمة المرور حتى تسجل الدخول. `http://localhost:3000/api/health` يبيّن إن السيرفر اشتغل فقط، مو إن Google وافقت على صلاحياتك.

## 2) شنو الروابط عقب النشر؟

- `/` → لوحة المشتريات في `/dashboard.html`
- `/api/health` → فحص تشغيل الباك إند
- `/api/webhook` → استلام إشعارات Google Play Pub/Sub PUSH
- `/api/mcp` → 15 أداة MCP للقراءة فقط، تتطلب Bearer token
- `/mcp-info` → صفحة تعريفية عن أدوات MCP

## 3) متغيرات Vercel

شوف `.env.example`، واكتب القيم الحقيقية **فقط** داخل `.env.local` على جهازك أو **Vercel → Project → Settings → Environment Variables**. لا ترفع `.env.local` إلى GitHub، ولا ترسل أي سر في المحادثة.

### لتشغيل لوحة المشتريات

| الاسم | المطلوب |
|---|---|
| `MONGODB_URI` | رابط MongoDB Atlas مع اسم المستخدم وكلمة المرور، خليه Secret |
| `MONGODB_DB` | `brickbreaker_play` (أو اسم مناسب) |
| `ADMIN_PASSWORD` | كلمة مرور لوحة التحكم، 12 حرفاً على الأقل |
| `SESSION_SECRET` | مفتاح جلسة عشوائي 32 بايت أو أكثر |
| `TOKEN_ENCRYPTION_KEY` | Base64 من 32 بايت للتشفير AES-256 |
| `GOOGLE_PLAY_PACKAGE_NAME` | `com.forgepulse.brickbreakerball` |
| `PUBSUB_PUSH_SERVICE_ACCOUNT` | بريد حساب الخدمة المخصص لـ Push |
| `PUBSUB_AUDIENCE` | `https://YOUR-DOMAIN.vercel.app/api/webhook` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | اختياري لمجرد تسجيل الإشعارات، لازم للتحقق من مشتريات Google Play |

لإنشاء المفاتيح على جهازك:

```powershell
node scripts/generate-secrets.cjs
```

يولّد قيمتين، احتفظ بهما سرّيتين. لا تستبدل `TOKEN_ENCRYPTION_KEY` بعد استقبال إشعارات حقيقية، لأن ذلك يمنع فك تشفير رموز الشراء القديمة.

### لتشغيل MCP (اختياري)

- `MCP_BEARER_TOKEN`: مفتاح وصول سري طويل، عشوائي 32 حرفاً على الأقل (يفضل 64 hex).
- `ANDROID_PACKAGE_NAME`: نفس اسم حزمة لعبتك.
- `GOOGLE_CLOUD_PROJECT_ID`: `brickbreakerball-508820`.
- `GOOGLE_SERVICE_ACCOUNT_JSON`: حساب خدمة مخوّل لقراءة Google Play/Cloud.
- `FIREBASE_DATABASE_URL` و`FIREBASE_SERVICE_ACCOUNT_JSON`: للقراءة المحدودة من Firebase (اختيارية لو تبي Firebase).
- OAuth الخاص بـ AdMob/AdSense: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` (اختياري عند استخدام أدوات هالخدمات).

MCP **للقراءة فقط**، ولا ينشر إعلانات أو يغيّر إعدادات Google Play. مفاتيح OAuth لا تُحفظ داخل تطبيق Android.

## 4) النشر على Vercel

1. أنشئ **مستودع GitHub خاص** وضع فيه محتويات هالمجلد فقط (الملف `.env.local` ممنوع).
2. افتح [vercel.com/new](https://vercel.com/new) واستورد المستودع.
3. **Framework Preset: Next.js**، **Root Directory: جذر المشروع**.
4. Install Command: `pnpm install` (إذا تستخدم pnpm)، Build Command: `pnpm build`، Output Directory: اتركه تلقائي.
5. ضيف متغيرات البيئة المطلوبة من الخطوة السابقة في Vercel.
6. اضغط Deploy. افتح رابط `/api/health` ثم رابط اللوحة الرئيسي.
7. بعد تغيير متغيرات البيئة اعمل Redeploy.

> Vercel وMongoDB وPub/Sub توفر باقات/حصص مجانية لكن ممكن تترتب رسوم عند تجاوز الحدود أو اختيار خدمات مدفوعة؛ مجانية الخدمة مو مضمونة لكل استخدام.

## 5) ربط Google Play Pub/Sub مع Vercel

إنت أنشأت Topic اسمه:
`projects/brickbreakerball-508820/topics/play-billing-notifications`

- تأكد في Google Play Console إن اسم الموضوع مضبوط.
- في Google Cloud أنشئ **Subscription من نوع Push** لنفس الـ Topic (مو Pull إذا ما عندك برنامج يسحب الرسائل).
- Endpoint: `https://YOUR-DOMAIN.vercel.app/api/webhook`.
- فعّل Authentication لطلب Push، واختر حساب خدمة مخصص. حط بريده في `PUBSUB_PUSH_SERVICE_ACCOUNT`.
- Audience لازم يطابق `PUBSUB_AUDIENCE` بالضبط.
- تأكد حساب خدمة Push مخوّل لإصدار OIDC Token حسب تعليمات Google الرسمية.
- بعد نشر الباك إند، استخدم زر **Send test notification** في Google Play Console، وشوف إذا ظهر في لوحة المشتريات.
- لا تعامل إشعار Google Play وحده على أنه دليل دفع ناجح. الكود يخزّن الإشعارات ويتحقق من حالة الشراء إذا API مفعّل، **ولا يضيف الجواهر تلقائياً**.

## 6) مشاكل شائعة

- `Cannot find module`: شغّل `pnpm install` داخل جذر المشروع.
- `Missing environment variables`: راجع `.env.local` أو Vercel Environment Variables.
- `Database not ready`: راجع MongoDB Atlas Network Access وURI والمستخدم.
- `401 Unauthorized Pub/Sub`: راجع حساب الخدمة وAudience ورموز OIDC.
- `401` على `/api/mcp`: طبيعي من دون Bearer token.
- `next build` يفشل: شغّل `pnpm typecheck` وارسِل نص الخطأ **بدون بيانات سرية**.

### ملاحظة مهمة
لم يتم النشر داخل حسابك تلقائياً. المشروع جاهز **كملفات للرفع والتجربة**؛ يحتاج متغيرات وأذونات حساباتك، ولم يتم تأكيد نجاح تشغيله على Vercel إلى أن تجرّب Deploy.
