# إصلاح فشل نشر ForgePulse MCP على Vercel (v2.1)

## الخطأ الأصلي
- `src/lib/mcp-control.ts(98,35) TS2352`: MongoDB يُرجع النوع الافتراضي `ObjectId`، بينما معرّف الفحص المحفوظ في `mcp_checks._id` هو اسم الخدمة النصي.
- `src/lib/mcp-control.ts(103,91) TS18048`: يحتمل أن تكون الخدمة من دون فحص سابق، وبالتالي قيمة `latest` غير موجودة.

## شنو عدّلنا؟
1. أضفنا نوع `ConnectionCheck` الذي يعرّف `_id` كـ `ServiceId`، واستخدمناه عند القراءة والكتابة في `mcp_checks`.
2. عرّفنا `Map<ServiceId, ConnectionCheck>` بشكل صريح بدلاً من إجبار `ObjectId` على نوع نصي.
3. فحصنا وجود `latest` قبل الوصول إلى `latest.status`. عند غياب نتيجة حديثة تكون الحالة `pending` وليس كراش.
4. عدّلنا الاختبار الخاص بالداشبورد ليمنع رجوع نفس الخطأ. ولا تعديل على بوابة Google Play أو ألوان الواجهة أو متغيرات البيئة.

## أسرع طريقة للتحديث
إذا مشروعك الحالي منشور على GitHub، تقدر **تستبدل ملفين فقط** من النسخة المعدّلة:
- `src/lib/mcp-control.ts`
- `tests/mcp-dashboard-structure.test.mjs`

وإلا يمكنك فك ZIP ونقل الملفات كاملة إلى مشروعك الحالي مع مراجعة أي تغييرات محلية قبل الاستبدال. **لا تنسخ `.env.local` ولا تستبدل إعدادات Vercel السرية.**

### أوامر Windows PowerShell داخل جذر المشروع
```powershell
pnpm install
pnpm test
pnpm build
# إذا نجح البناء، ارفع التعديل إلى فرع main:
git add src/lib/mcp-control.ts tests/mcp-dashboard-structure.test.mjs
git commit -m "Fix TypeScript checks in MCP dashboard"
git push origin main
```

عقبها Vercel يبدأ نشر جديد من GitHub؛ راقب Build Logs لين تظهر Ready.

## نتيجة فحص النسخة هنا
- 14/14 اختبار مشروع Next.js وMCP ناجح.
- 5/5 اختبار منطق المشتريات القديمة ناجح.
- فحص صياغة 23 ملف TypeScript/TSX نجح من دون أخطاء Syntax.
- **لم نتمكن من تشغيل `pnpm build` الكامل محلياً** بسبب عدم توفر حزم المشروع المثبتة هنا؛ فحص Vercel القادم هو التأكيد النهائي على نجاح TypeScript والبناء.
- لم يُختبر الاتصال الحي بحسابات Google أو Firebase من بيئة الفحص، ولم يتم تعديلها.

## تنبيه أمان
لا ترفع ملف Firebase JSON أو Google Play JSON أو `.env.local` أو مفاتيح Admin إلى GitHub. احتفظ ببيئة Vercel الحالية كما هي.
