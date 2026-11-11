# ربط ChatGPT بـ ForgePulse MCP عبر OAuth 2.1

## الوضع
- خادم MCP: https://brickbreakerball-backend.vercel.app/api/mcp
- OAuth Protected Resource Metadata: https://brickbreakerball-backend.vercel.app/.well-known/oauth-protected-resource
- OAuth Authorization Server Metadata: https://brickbreakerball-backend.vercel.app/.well-known/oauth-authorization-server
- النطاق المسموح: `mcp:read` فقط.
- يستخدم حساب مسؤول لوحة ForgePulse الحالي للموافقة، ولا يحتاج Google Cloud Service Account جديد.
- `MCP_BEARER_TOKEN` يبقى مدعومًا لعملاء MCP السابقين.

## قبل الربط
1. فعّل متغير بيئة Vercel **في Production فقط**: `MCP_OAUTH_ENABLED=true`، وبعدها نفّذ نشر جديد أو إعادة نشر.
2. `MCP_OAUTH_BASE_URL` اختياري، وقيمته الافتراضية هي `https://brickbreakerball-backend.vercel.app`. إن استخدمته فلا تحط مسار أو slash أخير غير طبيعي.
3. تأكد أن MongoDB والجلسة الإدارية الحالية تعمل، وأن `ADMIN_PASSWORD` و`SESSION_SECRET` مضبوطين. لا ترسل أي أسرار إلى ChatGPT.
4. افتح عنوان metadata أعلاه وتأكد أن HTTP 200 يعرض `authorization_servers` و`resource`.
5. افتح ChatGPT → Settings → Plugins → Add custom MCP server؛ اختر **OAuth مع التسجيل التلقائي بواسطة CIMD** (وليس عميل OAuth يدوي) إن توفر في واجهتك، وضع عنوان MCP.
6. سيظهر إذن الربط. إذا ما كان تسجيل دخول المسؤول ظاهرًا في OAuth بسبب SameSite=Strict، افتح لوحة ForgePulse في التبويب الثاني، سجّل الدخول، ثم اضغط **متابعة بعد تسجيل الدخول** من صفحة الإذن.
7. بعد الموافقة، جرّب `gateway_status` ثم `cloud_get_project`.

**مهم:** لا تكتب `FORGEPULSE_MCP_TOK` في خانة OAuth Client ID. هذا ليس Client ID. يعتمد الربط على ChatGPT Client ID Metadata Documents الموثقة من ChatGPT؛ يتحقق الخادم من الوثيقة التي يقدمها ChatGPT ومن URI إعادة التوجيه، ويقبل `none` مع PKCE-S256 فقط.

## الأمن
- كل طلب على `/api/mcp` يتحقق من Bearer Token، والسياق OAuth مقصور على audience `/api/mcp` و`mcp:read`.
- أكواد التفويض تستخدم مرة واحدة وتنتهي بعد دقيقتين؛ Access Token صالح ساعة، Refresh Token يدور عند التجديد وينتهي بعد 30 يوم.
- قاعدة البيانات تخزن SHA-256 للأكواد والرموز، مع TTL لحذف المنتهي.
- لا يتم تنفيذ OAuth إلا عند ضبط `MCP_OAUTH_ENABLED=true`، والإيقاف الفوري يتم عبر إرجاعها `false` وإعادة النشر.
- **تنبيه:** هذا تدفق مخصص لحساب مسؤول واحد؛ يفضل استخدام مزود OAuth معروف عند توسيعه لمستخدمين متعددين. تابع مراقبة سجلات Vercel وMongoDB بعد الربط.
