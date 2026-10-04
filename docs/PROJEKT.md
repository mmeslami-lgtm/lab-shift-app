# پروژه Dienstplaner — سند تحویل (وضعیت: اکتبر ۲۰۲۶)

> این سند برای ادامهٔ کار است: اگر در یک چت جدید با Claude کار می‌کنی، **این فایل + زیپ پروژه** را بده و بگو چه تغییری می‌خواهی.
> هیچ رمز یا کلیدی در این سند نیست و نباید باشد.

## ۱. این پروژه چیست
سه محصول روی **یک پروژهٔ Next.js (App Router)** که روی **Vercel** اجرا می‌شود و **یک دیتابیس Supabase (چندشرکتی)** دارد:

| آدرس | محصول (کلید در `org_products`) | برای چه کسی |
|---|---|---|
| `/` | Dienstplaner Labor (`lab_planner`) | Leitung / Inhaber |
| `/allgemein` | Dienstplaner allgemein (`generic_planner`) | Leitung / Inhaber |
| `/mitarbeiter` | اپ کارمند «Meine Schichten» (`employee_app`) | کارمندان |
| `/freigaben` | Freigaben & Archiv | Leitung (مشاهده/ارسال)، Inhaber (تأیید/رد/تنظیمات) |
| `/konto` | ورود + «Sicherheits-Check» (تست جدایی شرکت‌ها) | همه |
| `/demo` | پیش‌نمایش اپ کارمند با داده نمونه | آزاد، بدون ورود |
| `/api/attendance` | دریافت ثبت ورود/خروج از دستگاه | دستگاه (با serial + secret) |

هر دو Dienstplaner در **یک جدول مشترک** می‌نویسند؛ اپ کارمند فقط همان را می‌خواند. وصل‌شدن به اپ کارمند = یک ردیف `employee_app` در `org_products` برای آن شرکت.

## ۲. محل‌ها (بدون اسرار)
- کد: GitHub `mmeslami-lgtm/lab-shift-app` (شاخهٔ `main`) ← هر Commit خودکار روی Vercel دیپلوی می‌شود.
- Vercel: پروژهٔ `lab-shift-app` (`lab-shift-app.vercel.app`). پروژهٔ `scheduler` قدیمی و بی‌ربط است.
- Supabase: «mmeslami-lgtm's Project»، منطقهٔ Frankfurt. پلن رایگان بعد از حدود یک هفته بی‌فعالیتی خودکار **Pause** می‌شود → قبل از استفادهٔ واقعی Pro لازم است.
- متغیرهای محیطی در Vercel (فقط نام): `NEXT_PUBLIC_SUPABASE_URL`، `NEXT_PUBLIC_SUPABASE_ANON_KEY`، `SUPABASE_SERVICE_ROLE_KEY` (فقط سمت سرور؛ هرگز در مرورگر).

## ۳. دیتابیس
اسکریپت‌ها در `docs/sql/` به این ترتیب اجرا می‌شوند (SQL Editor، یک بار هرکدام):
1. `1-attendance-schema.sql` — staff، badges، attendance_*، scheduled_shifts
2. `2-multi-tenant-schema.sql` — شرکت‌ها، محصولات، عضویت‌ها، RLS، دستگاه‌ها، `create_organization(...)`
3. `3-approval-archive-schema.sql` — تأیید، بایگانی، مدت نگه‌داری
- `test-setup.sql` — دو شرکت آزمایشی + ۳ کاربر تست (فقط برای تست).

مفاهیم کلیدی:
- هر جدول داده ستون `org_id` دارد؛ **RLS** جداسازی شرکت‌ها را در خود دیتابیس تضمین می‌کند (تست واقعی: `/konto`).
- نقش‌ها: `owner` (Inhaber)، `supervisor` (Leitung)، `employee`. هر کاربر با `memberships` به شرکت وصل است؛ کارمند با `staff_id` به یک ردیف `staff`.
- پلن: `scheduled_shifts` با `status` = `draft` / `published`؛ کارمند فقط `published` می‌بیند.
- جریان تأیید (`schedule_months.status`): draft → pending → published. توابع: `save_draft`، `submit_month`، `reject_month`، `publish_month`، `set_org_settings`، `purge_expired_versions`.
- بایگانی: `schedule_versions` (تغییرناپذیر؛ عکس لحظه‌ای هر ارسال/رد/انتشار + `keep_until`).
- تنظیمات شرکت: `organizations.require_approval` (پیش‌فرض true) و `retention_years` (پیش‌فرض ۶، بین ۲ تا ۱۰).
- ساختن شرکت جدید: `select create_organization('نام', '<UID مالک>', array['lab_planner','employee_app']);` (SQL Editor).
- دستگاه حضور و غیاب: ردیف در `devices` (serial + هش sha256 رمز).

## ۴. نقشهٔ فایل‌ها
- `app/*/page.js` — هر صفحه، پشت `ProductGate` (ورود + محصول + نقش)
- `components/ProductGate.jsx` — قفل ورود/محصول/نقش؛ `lib/orgContext.js` اطلاعات شرکت را به پایین می‌دهد
- `components/LabShiftScheduler.jsx` / `GenericShiftScheduler.jsx` — دو Dienstplaner (منطق تولید پلن + UI)
- `components/OrgBar.jsx` — نوار شرکت، «Personen aus Datenbank laden / in Datenbank speichern»، وضعیت ماه
- `components/PublishPanel.jsx` — ذخیرهٔ پیش‌نویس، ارسال برای تأیید، انتشار
- `components/ScheduleReview.jsx` — صفحهٔ Freigaben & Archiv
- `components/EmployeeLive.jsx` — اپ کارمند با داده واقعی (Plan، Team)؛ `EmployeeShiftView.jsx` فقط نسخهٔ دمو
- `components/AccountPanel.jsx`، `LoginForm.jsx` — ورود و /konto
- `lib/supabaseClient.js` (مرورگر)، `lib/supabaseAdmin.js` (سرور)، `lib/storage.js` (localStorage برای آرشیو مرورگری)
- `app/api/attendance/route.js` — API دستگاه
- `public/` — manifest، آیکون‌ها، `sw.js` (PWA)

## ۵. قوانین Dienstplaner (خلاصه)
- ساعت شیفت = بازهٔ زمانی منهای ۳۰ دقیقه استراحت بدون حقوق.
- شیفت شب: بلوک ۲ تا ۴ شب، ≥۲ روز استراحت + ۲ روز cooldown؛ شنبه→یکشنبه ترجیحاً همان نفر.
- **استراحت بعد از شب مطلق است** و حتی با کمبود نیرو شل نمی‌شود.
- حداکثر ۶ روز کاری پشت‌سرهم؛ سقف ماهانه برای Teilzeit/Minijob سخت، تمام‌وقت تا ۱۹۰ ساعت.
- Labor: F/S/N ثابت، شیفت‌های میانی قابل ویرایش (پیش‌فرض Mitteldienst روزانه و Büro سهمیه‌ای). allgemein: F/S از قبل، هر شیفتی با `requiresRestAfter` رفتار شب می‌گیرد؛ قانون ۱۱ ساعت استراحت.
- خروجی Excel (.xlsx) با ۳–۴ برگ؛ روی گوشی منوی Teilen باز می‌شود.

## ۶. کارهای باز (به ترتیب پیشنهادی)
1. ساختن ورود برای هر کارمند از خود Dienstplaner (بخش سرور با `service_role`؛ رمز اولیه یا ایمیل دعوت).
2. اپ کارمند: Anträge، Zeiten، Wünsche به دیتابیس وصل شوند (جدول‌ها آماده‌اند).
3. ورود/خروج: تبلت با QR متحرک + PIN (طراحی شده، ساخته نشده).
4. تست قوی‌تر نوشتن بین شرکت‌ها (با شناسهٔ واقعی شرکت دیگر).
5. نام محصول + دامنهٔ اختصاصی، قبل از نصب اپ توسط پرسنل واقعی.
6. پرداخت/اشتراک (Stripe)، Vercel Pro، ثبت شرکت.

## ۷. یادآوری حقوقی/تجاری (تأیید نهایی با مشاور)
- Vercel رایگان فقط غیرتجاری است → برای مشتری واقعی Pro.
- نگه‌داری داده کارمند برای شرکت دیگر = قرارداد پردازش (AVV/DSGVO)، Datenschutzerklärung، Impressum، AGB.
- Betriebsrat: تغییر برنامهٔ شیفت معمولاً با آن هماهنگ می‌شود.
- مدت نگه‌داری: حداقل ۲ سال برای ثبت ساعت کار (§16 ArbZG، §17 MiLoG)، ۶ سال برای مدارک مالیات حقوق (§41 EStG). پیش‌فرض اپ ۶ سال؛ هیچ‌چیز خودکار پاک نمی‌شود.

## ۸. حساب‌های تست
`a-chef@test.de` (Inhaber شرکت A)، `leitung@test.de` (اختیاری، Leitung A)، `mitarbeiter@test.de` (کارمند A = Anna)، `b-chef@test.de` (Inhaber شرکت B). رمزها را خودت تعیین کرده‌ای؛ برای تغییر رمز تست: `update auth.users set encrypted_password = extensions.crypt('NEUES-PASSWORT', extensions.gen_salt('bf')) where email = '...';`

## ۹. چگونه تغییر بدهیم
یک تغییر = معمولاً چند فایل. فایل‌های تغییرکرده را روی GitHub جایگزین کن (Upload files یا ویرایش با مداد) → Vercel خودش می‌سازد (۱–۲ دقیقه). اگر تغییر جدول لازم باشد، یک اسکریپت SQL کوچک هم می‌دهیم. بازگشت: Vercel → Deployments → دیپلوی قبلی → Promote.
