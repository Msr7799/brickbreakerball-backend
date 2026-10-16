# تشغيل سيرفر ForgePulse Google MCP (شرح بحريني)

## شنو جاهز؟
- مشروع MCP موحّد على Next.js ينفع على Vercel.
- 15 أداة لقراءة Firebase وPlay Console وCloud وAdMob وAdSense.
- محمي بمفتاح وصول خاص، بدون أدوات تغيير أو حذف أو نشر.
- الربط مع AI عن طريق OpenAI Responses API أو أي عميل MCP يدعم Streamable HTTP وBearer Token.

## خطواتك بالترتيب

1. فك ضغط الملف، وادخل على المجلد في PowerShell.
2. تأكد عندك Node.js 20 أو أحدث.
3. نفّذ `npm install`.
4. نفّذ `Copy-Item .env.example .env.local`.
5. ولّد سر السيرفر بهذا الأمر:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
6. حط الناتج في `MCP_BEARER_TOKEN` داخل `.env.local`. **لا ترسله لأحد ولا تحطه في GitHub**.
7. نفّذ `npm run dev` وافتح `http://localhost:3000/api/health`.
8. من Google Cloud وفايربيس وPlay Console جهّز صلاحيات الخدمات المطلوبة، وعبّي باقي المتغيرات حسب `README.md`.
9. لـ AdMob وAdSense: فعّل الـ API، سو OAuth Desktop Client، وشغّل `npm run oauth` بالطريقة المشروحة في README. خذ Refresh Token فقط على جهازك واحفظه في إعدادات البيئة.
10. ارفع **الكود فقط** على GitHub خاص، واستورده من Vercel، وضيف المتغيرات في Project Settings → Environment Variables. بعدها Deploy.
11. جرّب الرابط `https://YOUR-PROJECT.vercel.app/api/health`، وبعده اختبر `/api/mcp` باستخدام `npm run test:mcp`.
12. لربط OpenAI API، استخدم `examples/openai-responses.mjs` واتبع تعليمات README.

## متغيرات مهمة
- `MCP_BEARER_TOKEN`: يحمي السيرفر.
- `GOOGLE_SERVICE_ACCOUNT_JSON`: لحساب Google Play وGoogle Cloud.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: لمشروع Firebase إذا مختلف عن حساب Cloud.
- `FIREBASE_DATABASE_URL`: رابط Realtime Database الحقيقي.
- `FIREBASE_ALLOWED_PREFIX=/mcp`: يمنع قراءة بقية قاعدة البيانات من الأداة.
- `ANDROID_PACKAGE_NAME=com.forgepulse.brickbreakerball`: اسم حزمة اللعبة.
- `GOOGLE_CLOUD_PROJECT_ID`: معرف مشروع Cloud.
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`: للـ AdMob والـ AdSense.

## شغلة مهمة
- هذا **مشروع جاهز من ناحية الملفات والكود**، مو سيرفر منشور على حسابك؛ لازم تربط مفاتيح Google الخاصة فيك وتعمل Deploy.
- دخول ChatGPT نفسه عبر موصل مخصص قد يتطلب OAuth 2.1 إضافي؛ هذا المشروع ما يوعد بربط مباشر من واجهة ChatGPT. **OpenAI API** مدعوم.
- لا تشارك Service Account JSON أو Refresh Token أو MCP Bearer Token داخل المحادثة.
- تكلفة Vercel أو Google Cloud حسب الاستخدام، مو بالضرورة كل شي مجاني.
