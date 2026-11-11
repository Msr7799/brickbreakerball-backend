# إعداد مكافآت Brick Breaker Ball اليومية

بعد دمج هذا التعديل ونشر Vercel، أضف `MONGODB_URI` و`MONGODB_DB` و`FIREBASE_SERVICE_ACCOUNT_JSON` في متغيرات Vercel السرية. يجب أن يخص حساب خدمة Firebase نفس مشروع اللعبة. يمكن استخدام `GOOGLE_SERVICE_ACCOUNT_JSON` إذا كان مفوضاً لنفس مشروع Firebase.

شغّل `pnpm test` و`pnpm build` قبل النشر. API:
- `GET /api/rewards/daily/status`
- `POST /api/rewards/daily/claim`

كلاهما يتطلب `Authorization: Bearer <Firebase ID token>`. التحقق يتم بخادم Firebase Admin، وليس عبر ساعة الجهاز. تزامن المطالبات يحسمه تحديث ذري في MongoDB داخل `daily_rewards_v1`.

اضبط `rewardsApiBaseUrl` في Gradle على أصل HTTPS الخاص بنشر الباك إند فقط مثل `https://YOUR-SITE.vercel.app`. اترك القيمة فارغة إلى حين تجهيز الخدمة؛ اللعبة لن تمنح مكافآت يومية محلية باستخدام ساعة الهاتف عند غياب السيرفر. جرّب المطالبة المتكررة من جهازين على حساب واحد، وانقطاع الإنترنت، وتغير يوم البحرين.

**مهم:** المكافآت القديمة كانت محلية. لا ننقل سجلاً غير موثوق تلقائياً؛ سجل المكافآت السحابي يبدأ عند تفعيل الخدمة. باقي المحفظة داخل اللعبة محلي حالياً، فلا تعتبر هذا النظام مزامنة كاملة لكل العملات والمشتريات. لا تضع رموز سرية أو Firebase service-account داخل Android أو GitHub.
