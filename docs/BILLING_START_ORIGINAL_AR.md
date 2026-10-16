# ابدأ من هني 💙

يا هلا! هالملف فيه **الخطوات الأولى فقط** عشان ما تتوه.

1. فك الضغط عن الملف `brickbreaker-play-backend.zip`.
2. ادخل المجلد واقرأ `README.md` إذا تبي كل التفاصيل.
3. جهّز **MongoDB Atlas** ورابط الاتصال الخاص بقاعدة البيانات.
4. افتح نافذة PowerShell في المجلد واكتب: `node scripts/generate-secrets.js` لتوليد أسرارك.
5. ارفع المجلد إلى GitHub **Private**، ثم استورده في Vercel.
6. في Vercel أضف متغيرات البيئة اللي في `.env.example`، وخل الدومين ثابت.
7. أنشئ **Service Account** باسم `rtdn-push` لتوثيق وصول رسائل Google Pub/Sub، **لا تخلط بينه وبين حساب API حق التحقق من الشراء**.
8. في Pub/Sub سو **Push subscription** يشير إلى `https://YOUR-DOMAIN.vercel.app/api/webhook` مع OIDC Authentication.
9. ارجع Google Play واضغط **إرسال إشعار اختبار**.
10. افتح لوحة Vercel وشوف سجل الإشعارات.

**مهم:** هالخدمة تعرض بيانات مشتريات اللعبة وإشعارات Google Play، وليست تفعيل AdMob. وبما إنها تعتمد على Google Cloud وVercel وMongoDB، فهي عادة قليلة التكلفة مع الاستخدام المحدود لكن ما أقدر أضمن إن فواتيرك صفر في كل الأحوال.

**وقف عند الخطوة 3 وطرّش صورة صفحة MongoDB Atlas من دون كلمات مرور أو روابط سرية، وبنكمّل حبة حبة.**
