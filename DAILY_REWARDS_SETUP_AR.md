# إعداد مكافآت Brick Breaker Ball اليومية

اللعبة المنشورة تستخدم Play Games في `brickbreakerball-508820`، بينما بيانات Firebase Auth ومكافآت اللاعبين في `brick-breaker-ball-8e4f5`. لا تدمج المشروعين أو تنقل حسابات اللاعبين. يرسل Android رمز Play Games المؤقت إلى `POST /api/auth/play-games`، فيتحقق الخادم من اللاعب عبر Google ثم يصدر Firebase Custom Token من مشروع Firebase. يستخدم Android الرمز لتسجيل الدخول إلى Firebase، وبعدها تستخدم واجهات المكافآت Firebase ID Token المعتاد.

متغيرات Vercel المطلوبة للإنتاج:
- `PLAY_GAMES_SERVER_CLIENT_ID`: معرّف عميل Game Server من مشروع Play Games `6148685744`.
- `PLAY_GAMES_SERVER_CLIENT_SECRET`: سر نفس العميل؛ يُحفظ في Vercel فقط.
- `GAME_FIREBASE_SERVICE_ACCOUNT_JSON`: حساب خدمة مخصص من مشروع Firebase `brick-breaker-ball-8e4f5` بصلاحية قراءة Firebase Authentication. لا تعتمد واجهات المكافآت على `GOOGLE_SERVICE_ACCOUNT_JSON` أو `FIREBASE_SERVICE_ACCOUNT_JSON` لأنهما يخدمان وظائف أخرى وقد يشيران إلى مشروع مختلف.
- `MONGODB_URI` و`MONGODB_DB`: مخزن المطالبات اليومية.

يجب أن يطابق `playGamesWebClientId` في Android معرّف Game Server نفسه. يحتاج كل من تطبيق الإنتاج ونسخة QA إلى بيانات اعتماد Android المناسبة لاسم الحزمة وبصمة SHA-1 في Play Games Console. لا تضع Client Secret أو ملف حساب الخدمة في تطبيق Android أو GitHub.

شغّل `pnpm test` و`pnpm build` قبل النشر. API:
- `GET /api/rewards/daily/status`
- `POST /api/rewards/daily/claim`

كلاهما يتطلب `Authorization: Bearer <Firebase ID token>`. التحقق يتم بخادم Firebase Admin، وليس عبر ساعة الجهاز. تزامن المطالبات يحسمه تحديث ذري في MongoDB داخل `daily_rewards_v1`.

اضبط `rewardsApiBaseUrl` في Gradle على أصل HTTPS الخاص بنشر الباك إند فقط مثل `https://YOUR-SITE.vercel.app`. اترك القيمة فارغة إلى حين تجهيز الخدمة؛ اللعبة لن تمنح مكافآت يومية محلية باستخدام ساعة الهاتف عند غياب السيرفر. جرّب المطالبة المتكررة من جهازين على حساب واحد، وانقطاع الإنترنت، وتغير يوم البحرين.

**مهم:** المكافآت القديمة كانت محلية. لا ننقل سجلاً غير موثوق تلقائياً؛ سجل المكافآت السحابي يبدأ عند تفعيل الخدمة. باقي المحفظة داخل اللعبة محلي حالياً، فلا تعتبر هذا النظام مزامنة كاملة لكل العملات والمشتريات. لا تضع رموز سرية أو Firebase service-account داخل Android أو GitHub.
