# إصلاح اتصال AdMob وAdSense (Google OAuth)

## المشكلة المؤكدة

إذا رجعت أدوات `admob_list_accounts` و`adsense_list_accounts` بخطأ `invalid_grant`، فمعناه إن Google رفضت تجديد التوكن. **تعديل الكود أو إعادة نشر Vercel وحده ما يرجّع صلاحية ملغية**. يحتاج صاحب حساب Google يسجّل دخول ويوافق على صلاحيات القراءة مرة ثانية.

## الخطوات الآمنة

1. من Google Cloud Console، افتح **Google Auth Platform → Audience** لنفس المشروع، وتأكد من وضع التطبيق (Testing / In production). إذا كان External + Testing، توكنات OAuth ذات الصلاحيات غير الأساسية غالباً تنتهي بعد 7 أيام.
2. تأكد إن **AdMob API** و**AdSense Management API** مفعّلتين وإن حساب Google اللي بتوافق منه عنده صلاحية للوصول للخدمتين.
3. على جهازك المحلي فقط، افتح المشروع وثبّت الاعتمادات (`pnpm install`). عرّف المتغيرين `GOOGLE_OAUTH_CLIENT_ID` و`GOOGLE_OAUTH_CLIENT_SECRET` من **نفس OAuth Client** الموجود في Vercel. لا ترسل قيمهم في ChatGPT ولا تحفظهم في GitHub.
4. في PowerShell أنشئ ملف `.env.local` إن ما كان موجود، وأضف `GOOGLE_OAUTH_CLIENT_ID` و`GOOGLE_OAUTH_CLIENT_SECRET` (لا ترفع الملف إلى GitHub). أمر OAuth يحمّل هالملف مباشرة بواسطة Node.js 20.9+؛ عقبها شغّل:

   ```powershell
   pnpm run oauth
   ```

   افتح رابط Google اللي يظهر على جهازك، ووافق على `admob.readonly` و`adsense.readonly`. السكربت يطبع توكن جديد محلياً فقط.
5. استبدل `GOOGLE_OAUTH_REFRESH_TOKEN` في **Vercel → brickbreakerball-backend → Settings → Environment Variables → Production** بالتوكن الجديد واحفظه كـSecret/Sensitive، ثم **Redeploy** من آخر Commit اختبرته.
6. جرّب `admob_list_accounts` و`adsense_list_accounts` مرة ثانية من MCP. نجاح سرد الحسابات شرط أولي قبل طلب التقارير.

### إذا حساب AdMob غير حساب AdSense

شغّل `pnpm run oauth -- --admob` في حساب AdMob واحفظ الناتج في `GOOGLE_ADMOB_REFRESH_TOKEN`. بعدها شغّل `pnpm run oauth -- --adsense` في حساب AdSense واحفظ الناتج في `GOOGLE_ADSENSE_REFRESH_TOKEN`. كل واحد يتقدم على التوكن المشترك عند وجوده.

### أخطاء ثانية

- `invalid_client` أو `unauthorized_client`: تطابق Google OAuth Client ID وClient Secret مع التوكن، وتأكد من السماح بنوع تطبيق Desktop.
- `403` في Pub/Sub: مشكلة صلاحيات IAM مستقلة عن OAuth. امنح حساب الخدمة المخصص، بعد مراجعة الحاجة، دور `roles/pubsub.viewer` لعرض Topics وSubscriptions. لا تغيّر دور المشروع كله إلى Owner.
- `gateway_status` يعرض **وجود الإعدادات** فقط؛ ما يؤكد صلاحية الوصول إلى Google.

**الأمان:** لا تطبع Refresh Token في سجلات الإنتاج ولا تضعه في GitHub أو رسائل ChatGPT. لا تحاول إعادة إصدار Refresh Token بشكل تلقائي من Vercel لأن العملية تتطلب موافقة المستخدم التفاعلية.
