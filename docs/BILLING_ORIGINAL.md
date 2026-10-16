# Brick Breaker Ball · Google Play Billing Backend

واجهة عربية + Webhook آمن من Google Cloud Pub/Sub + MongoDB Atlas + التحقق من حالة الشراء باستخدام Google Play Developer API، جاهزة للنشر على **Vercel**.

> **مهم جدًا:** هذا الباك إند مخصص **لإشعارات ومراقبة مشتريات Google Play Billing**، وليس لتفعيل إعلانات AdMob ولا يغيّر حالة مراجعة حساب AdMob. لا يعطي جواهر تلقائيًا ولا يحفظ رصيد اللاعبين. إذا تبي تحويله إلى نظام تسليم جواهر آمن، يحتاج ربط هوية اللاعب بين Kotlin وBackend وتصميم Ledger ومعالجة الاستردادات؛ وجود RTDN وحده لا يُعرّف اللاعب بشكل مضمون.

## شنو يبيّن لك؟

- عدد الإشعارات الواردة واختبارات الاتصال.
- إشعارات شراء المنتجات، ومن بينها حزم الجواهر مثل `buy-80-gems`.
- إشعارات الإلغاء والاسترداد والاشتراكات.
- هل تمت **مراجعة حالة الشراء فعليًا** عبر Google Play Developer API أو لا.
- إمكانية إعادة طلب التحقق من Google Play من داخل لوحة الإدارة.
- سجل دائم في MongoDB، مع وقت الإشعار، نوع المنتج، الحالة وتفاصيل محدودة.
- لوحة خاصة بكلمة مرور، وصفحة webhook تتحقق من **توقيع Google Pub/Sub OIDC** ومن حزمة تطبيقك.

الإحصائيات تحسب **الإشعارات** وقد تصل عدة إشعارات لنفس عملية الشراء؛ لذلك هي ليست عددًا محاسبيًا للطلبات الفريدة.

الواجهة **لا** تعرف تلقائيًا من هو اللاعب الذي اشترى، ولا عدد الجواهر اللي وصلت لجهازه، ولا المبلغ النهائي المسدد، ولا الأرباح من الإعلانات.

## قبل لا تبدأ

أنت أنشأت بالفعل:

- مشروع Google Cloud: `brickbreakerball-508820`.
- Topic: `projects/brickbreakerball-508820/topics/play-billing-notifications`.
- منحت حساب `google-play-developer-notifications@system.gserviceaccount.com` صلاحية **Pub/Sub Publisher** على الـ Topic.
- في Google Play Console أضفت نفس اسم الـ Topic وفعلت إشعارات المنتجات المدفوعة مرة واحدة.

**لا تحتاج تعيد هالأشياء.**

## المرحلة 1: جهّز قاعدة بيانات MongoDB Atlas

1. افتح [MongoDB Atlas](https://www.mongodb.com/products/platform/atlas-database) وسجّل دخولك.
2. إذا عندك Cluster جاهز، استخدمه أو أنشئ قاعدة جديدة. لو تبي أقل تكلفة، اختَر الخيار المجاني المتوفر لحسابك ومنطقتك إن ظهر، وتجنب إنشاء Cluster مدفوع بالغلط.
3. من **Database Access** أنشئ Database User **بصلاحية على قاعدة بيانات التطبيق فقط** قدر الإمكان. استخدم كلمة مرور قوية.
4. من **Network Access** جهّز السماح لاتصالات Vercel؛ لأن العناوين عادة متغيّرة في النشر العام، فالسماح الواسع للـ IP يعني أن كلمة مرور Mongo قوية وصلاحيات المستخدم المحدودة وحماية باقي الإعدادات أمر مهم. استخدام Private Networking أفضل للمشاريع الحساسة. اتبع خيارات MongoDB الرسمية المناسبة لخطة حسابك.
5. من **Connect → Drivers → Node.js** انسخ رابط اتصال Atlas `mongodb+srv://...`، وبدّل USER وPASSWORD بالقيم الصحيحة (ورمّز الرموز الخاصة في كلمة المرور URL-encoding).
6. لا تضع رابط الاتصال في Kotlin أو GitHub العام.

## المرحلة 2: جهّز أسرار لوحة التحكم

من الكمبيوتر شغّل:

```powershell
node scripts/generate-secrets.js
```

راح يطبع قيمتين عشوائيتين: `SESSION_SECRET` و`TOKEN_ENCRYPTION_KEY`.
خزّنهم بأمان داخل **Vercel Environment Variables**. لا تشاركهم بالصور ولا ترفعهم GitHub.

اختَر كلمة مرور إدارة قوية لا تقل عن 12 حرفًا لا تستخدمها بأي حساب آخر.

## المرحلة 3: انشر المشروع على Vercel

1. فك ZIP محليًا، وارفع ملفات مجلد المشروع إلى مستودع GitHub خاص **Private**.
2. افتح [Vercel](https://vercel.com/new) ← **Add New Project** ← استورد المستودع.
3. Framework preset: **Other** إذا طلب منك؛ Root directory هو مجلد المشروع الذي يحتوي `package.json`.
4. في **Settings → Environment Variables** ضع المتغيرات الموجودة في `.env.example`، بدون علامة `#`.
5. إذا ما عرفت اسم الدومين إلا بعد أول نشر، خل `PUBSUB_AUDIENCE` مؤقتاً بقيمة placeholder فقط عند النشر الأول، وبعد ما تحصل الدومين النهائي عدّله إلى `https://DOMAIN.vercel.app/api/webhook` وأعد النشر. **لن يقبل Webhook أي إشعارات حتى تتطابق قيمة Audience مع إعداد Pub/Sub**. كذلك لابد من ضبط باقي المتغيرات قبل تجربة تسجيل الدخول.
6. اختَر **Deploy**. افتح `https://DOMAIN.vercel.app` وسجّل الدخول بكلمة المرور التي عيّنتها.
7. افتح `https://DOMAIN.vercel.app/api/health`، ومن المفترض تظهر `{"ok":true,"service":"brickbreaker-play-backend"}`. هذي تفحص عمل Endpoint فقط، مو MongoDB أو Pub/Sub. اللوحة نفسها تعرض حالة MongoDB.

### متغيرات البيئة المطلوبة

| الاسم | شنو تحط فيه |
| --- | --- |
| `MONGODB_URI` | رابط اتصال MongoDB Atlas السري |
| `MONGODB_DB` | `brickbreaker_play` |
| `ADMIN_PASSWORD` | كلمة مرور قوية للوحة، 12 حرفًا أو أكثر |
| `SESSION_SECRET` | القيمة الأولى من مولّد الأسرار |
| `TOKEN_ENCRYPTION_KEY` | القيمة الثانية Base64 |
| `GOOGLE_PLAY_PACKAGE_NAME` | `com.forgepulse.brickbreakerball` |
| `PUBSUB_PUSH_SERVICE_ACCOUNT` | بريد حساب الخدمة الذي سوف تنشئه في المرحلة 4 |
| `PUBSUB_AUDIENCE` | `https://YOUR-DOMAIN.vercel.app/api/webhook` تمامًا |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | اختياري في البداية، مطلوب للتحقق الفعلي من عمليات الشراء |

**تحذير أمني:** إذا فعّلت Vercel Deployment Protection بحيث يطلب مصادقة Vercel قبل الوصول إلى Functions، لازم تسمح لوصول Google Pub/Sub إلى رابط webhook أو تضبط إعدادات النشر. هو نفسه محمي بتوقيع Google، فلا توقف تحقق JWT داخل الكود. عطّل وصول Webhook تمامًا إذا ما تبي خدمة خارجية تدخل عليه.

## المرحلة 4: حساب خدمة خاص لمصادقة Pub/Sub Push

1. افتح [Google Cloud IAM · Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts?project=brickbreakerball-508820).
2. اختر مشروع **BrickBreakerBall**، اضغط **Create Service Account**.
3. Service account ID: `rtdn-push` ثم **Create and continue**. ما يحتاج تعطيه Owner/Editor، خل الأدوار بدون إضافات واضغط **Done**.
4. خذ البريد الظاهر بشكل قريب من `rtdn-push@brickbreakerball-508820.iam.gserviceaccount.com` وانسخه إلى متغير Vercel `PUBSUB_PUSH_SERVICE_ACCOUNT`.
5. **مهم:** عشان خدمة Pub/Sub توقّع رسائل Push، يحتاج Pub/Sub **service agent** صلاحية **Service Account Token Creator** على حساب `rtdn-push`. من Google Cloud → Service Accounts → افتح حساب `rtdn-push` → Permissions → Grant access. المعنيّ بالصلاحية هو `service-PROJECT_NUMBER@gcp-sa-pubsub.iam.gserviceaccount.com` (رقم المشروع **الرقمي**، مو `brickbreakerball-508820`). تختار `Service Account Token Creator`، ولا تعطيها حساباً آخر بالغلط.
6. إذا صفحة إنشاء Subscription طلبت منك صلاحية `Service Account User` لحسابك الذي يربط Pub/Sub، أعطِها على حساب `rtdn-push` فقط إن لزم. ما تحتاج مفاتيح JSON لحساب Push هذا.
7. أعد نشر Vercel بعد إضافة المتغير.

دليل Google: https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions

## المرحلة 5: أنشئ Subscription من نوع **Push**

أنت أنشأت Topic سابقًا. **إذا ما ضغطت Create للـ Pull Subscription القديم، ممتاز، ما نحتاجه.** لو أنشأت اشتراك Pull سابقاً، لا تستخدمه للـ Backend. تقدر تحذفه بعد التأكد ما عليه مستهلكين يحتاجونه.

1. [Google Cloud → Pub/Sub → Subscriptions](https://console.cloud.google.com/cloudpubsub/subscription/list?project=brickbreakerball-508820) ← **Create subscription**.
2. **Subscription ID:** `play-billing-push`.
3. **Topic:** `projects/brickbreakerball-508820/topics/play-billing-notifications`.
4. **Delivery type:** `Push`، وليس `Pull`.
5. **Endpoint URL:** `https://YOUR-DOMAIN.vercel.app/api/webhook`.
6. **Enable authentication:** فعّله. **Service account:** حساب `rtdn-push@...` اللي أنشأته.
7. **Audience:** نفس رابط الـ Webhook، بالحرف، بدون `/` أخيرة: `https://YOUR-DOMAIN.vercel.app/api/webhook`.
8. **Enable payload unwrapping:** خله **مطفّي** لأن الكود يتوقع Pub/Sub wrapped message فيه `message.data`.
9. **Message retention:** 7 أيام كحد أقصى افتراضي للتجربة، ولا تفعل Export to BigQuery أو Cloud Storage.
10. اضغط **Create**.

هذي خدمة حسب الاستهلاك، ولها حدود مجانية ولكن **مو ضمان أن التكلفة دائماً صفر**. استلام إشعارات قليلة غالباً قليل التكلفة، وقد تنحسب رسوم إذا تجاوزت حدود الاستخدام أو استخدمت خدمات إضافية. راجع: https://cloud.google.com/pubsub/pricing و https://vercel.com/pricing و https://www.mongodb.com/pricing

## المرحلة 6: اختبار Google Play

1. افتح Google Play Console ← Brick Breaker Ball ← **تحقيق الربح مع Google Play → إعدادات تحقيق الربح**.
2. تأكد أن **تفعيل الإشعارات الفورية** عليه علامة صح، والـ Topic هو نفسه أعلاه.
3. اضغط **إرسال إشعار اختبار** (Test notification).
4. انتظر ثواني، ثم افتح لوحة Vercel ← **سجل الإشعارات** واضغط **تحديث**.
5. لازم يظهر صف نوعه «إشعار اختباري من Google Play» وحالته «اختبار».
6. إذا ما وصل شي: راجع **Pub/Sub → Subscriptions → Metrics**، وLogs الخاصة بـ Vercel. `401` يعني غالباً JWT/Audience/Service account، و`503` عادة نقص إعدادات أو مشكلة Mongo.

**مهم:** وصول إشعار اختبار ما يثبت صلاحية Google Play Developer API. يثبت وصول RTDN فقط.

## المرحلة 7: خل Google Play يؤكد عمليات الشراء الفعلية

هذه الخطوة **اختيارية للتجربة الأولية**، لكنها مطلوبة لإظهار «شراء مؤكّد» بدلاً من «التحقق غير مهيّأ»:

1. Google Cloud → [Google Play Developer API](https://console.cloud.google.com/apis/library/androidpublisher.googleapis.com?project=brickbreakerball-508820) ← Enable إن ما كانت مفعّلة.
2. Cloud → **IAM & Admin → Service Accounts** ← Create service account باسم مثل `play-purchase-verifier`.
3. من Google Play Console على مستوى حساب المطور **Users and permissions** ← **Invite new users** ← أضف بريد حساب الخدمة.
4. امنحه فقط الصلاحيات الضرورية للعبة: **View financial data, orders, and cancellation survey responses** و**Manage orders and subscriptions**، كما في توثيق Google Play Developer API. اختَر اللعبة المناسبة وحدها إذا سمحت واجهة الصلاحيات، وتجنب صلاحيات إدارة حساب المطور.
5. من إعدادات حساب الخدمة في Google Cloud أنشئ **JSON key** إن كانت سياسات المشروع تسمح؛ افهم أن ملف JSON يحتوي مفتاحاً سرياً شديد الحساسية. احفظه محلياً بطريقة آمنة ولا ترفعه GitHub ولا إلى تطبيق Android.
6. انسخ **محتوى JSON كاملًا** إلى Environment Variable `GOOGLE_SERVICE_ACCOUNT_JSON` داخل Vercel (متغير واحد)، وأعد نشر المشروع.
7. ابدأ بعملية شراء اختبارية قانونية عبر نظام اختبار المشتريات في Google Play. إذا وصل RTDN، سيتصل Backend بالـ Android Publisher API ليتحقق من حالة الشراء.
8. إذا وصل الإشعار قبل ضبط API، افتحه في اللوحة واضغط **إعادة التحقق من Google Play** بعد تجهيز الصلاحيات.

توثيق Google الرسمي: https://developers.google.com/android-publisher/getting_started

## إذا تغيّر دومين Vercel

غيّر `PUBSUB_AUDIENCE` في Vercel إلى رابط webhook الجديد **وأعد النشر**، وبعدها حدّث **Endpoint URL** و**Audience** في Google Pub/Sub Subscription بنفس الرابط. لا تستخدم دومين Preview يتغير مع كل Deployment.

## حالات قد تشوفها في اللوحة

| الحالة | معناها |
| --- | --- |
| إشعار اختباري | رسالة Test من Google Play، ليست عملية شراء |
| التحقق غير مهيّأ | RTDN وصل، لكن لم تُضف مفاتيح Play Developer API بعد |
| شراء مؤكّد | API أفاد أن حالة شراء المنتج `PURCHASED` |
| شراء معلّق | API يقول `PENDING`، فلا تُسلّم جواهر بعد |
| ملغي / مسترد | إشعار متعلق بالإلغاء أو الاسترداد |
| فشل التحقق | API لا يرد أو يرفض صلاحية حساب الخدمة؛ لا تفترض اكتمال الشراء |

**أمنياً:** يحتفظ التطبيق برموز الشراء مشفّرة AES-256-GCM ولا يعرضها في لوحة التحكم، ويخفيها من الـ API العام. الاسترداد الجزئي يعرض كإشعار يحتاج مراجعة، ولا يغيّر رصيد اللاعب تلقائياً.

## هل يحتاج تعديل Kotlin؟

**لا** لكي ترسل Google Play إشعارات RTDN لهذا الـ Backend. لكن لكي تربط كل عملية شراء **بلاعب معيّن** وتضيف الجواهر بشكل موثوق، تحتاج عمل إضافي: تسجيل/معرّف لاعب موثوق، ربط PurchaseToken به، Ledger مضاد للتكرار، عملية تسليم idempotent، واستهلاك المشتريات وتأكيدها وفق سياسات Billing. هذا المشروع **لوحة متابعة واستقبال وتحقق فقط**، وليس نظام مكافآت كامل.

## تشغيل الاختبارات محلياً

```powershell
npm install
npm test
npm run check
```

اختبارات المعالجة والمنطق الأساسية لا تتطلب اتصالاً بـ MongoDB أو Google Play. تشغيل السيرفر محلياً عبر `npx vercel dev` يحتاج المتغيرات الصحيحة.

## ملفات مهمة

- `public/index.html` + `public/style.css` + `public/app.js`: لوحة التحكم العربية.
- `api/webhook.js`: استقبال Pub/Sub Push وتحقق التوقيع.
- `api/events.js`, `api/status.js`, `api/recheck.js`: قراءة السجل والإحصائيات وإعادة التحقق.
- `lib/google.js`: Google Pub/Sub JWT + Google Play Developer API.
- `lib/db.js`: اتصال MongoDB الدائم.
- `.env.example`: أسماء متغيرات Vercel.

**الحماية:** لا تشارك كلمات المرور وملفات JSON وأسرار MongoDB ولا ترسلها في المحادثة. عند مشاركة صور، غطِّ بيانات تسجيل الدخول ومفاتيح الاتصال.
