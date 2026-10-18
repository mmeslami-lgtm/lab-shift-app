# Dienstplaner (SaaS) – خلاصهٔ کامل پروژه تا ۱۷ اکتبر ۲۰۲۶

> **برای Claude در گفتگوی جدید:** کاربر برنامه‌نویس نیست؛ فقط با مرورگر کار می‌کند و فایل‌ها را مستقیم در GitHub آپلود می‌کند. همیشه فارسی جواب بده، قدم‌به‌قدم و ساده. کد پروژه در این گفتگو نیست: اول از کاربر بخواه از GitHub (شاخهٔ `main` → «Code → Download ZIP») فایل زیپ را بفرستد. بسته‌های تحویلی همیشه فقط شامل فایل‌های تغییرکرده‌اند (zip، با همان ساختار پوشه‌ها). **این فایل (`docs/PROJEKT-ZUSAMMENFASSUNG.md`) را با هر کار جدید به‌روز کن و در همان بسته بگذار.**

---

## ۱. محیط کار

| چیز | مقدار |
|---|---|
| کد | GitHub `mmeslami-lgtm/lab-shift-app` – شاخهٔ `main` (اصلی) و `test` (آزمایشی) |
| برنامهٔ اصلی | `https://lab-shift-app.vercel.app` |
| برنامهٔ آزمایشی | `https://lab-shift-app-git-test-mmeslami-2517.vercel.app` (همان دیتابیس! فقط با شرکت‌های تست امتحان شود) |
| فناوری | Next.js 14 + Supabase + Vercel (توابع در `fra1`) |
| دیتابیس | Supabase پروژهٔ `fcyroslzykejcggplwgt`، منطقهٔ `eu-central-1` (فرانکفورت). اتصال MCP فعال است؛ مهاجرت‌ها مستقیم اجرا می‌شوند. |
| ⚠️ دست نزن | پروژهٔ دوم Supabase به نام `transport-scanner` (`wagdzdzwyypqyvdtxmkd`) مال شرکت **پسر کاربر** است. |
| وابستگی‌ها | next 14.2.5، react 18.3.1، @supabase/supabase-js 2.45.0، lucide-react، **jsqr 1.4.0** (جدید) |

## ۲. روال کار (تثبیت‌شده)

1. آپلود بسته در شاخهٔ **test** (گزینهٔ «Commit directly to the test branch»).
2. امتحان روی آدرس آزمایشی.
3. Pull request با `base: main ← compare: test` و Merge.
4. چک Vercel → Deployments. اگر خودکار نساخت: روی ردیف Preview «⋯ → Promote».
5. «Delete branch» هرگز زده نشود.

کاربر بسته‌های امتحان‌شده را گاهی مستقیم به main هم برده؛ چون محتوا یکی است، مشکلی نیست.

## ۳. آخرین بسته

- **`Upload-NUR-30-Aenderungen (روی ۲۶).zip`**: همهٔ کارهای زیر (شامل همین خلاصه در `docs/`). بسته‌های قدیمی‌تر بی‌اعتبارند.
- بستهٔ ۲۳ امتحان و در main است. **بستهٔ ۲۶ (حق مرخصی + Ziel ماهانه + اضافه‌کاری نقدی) باید در test آپلود و امتحان شود.**

## ۴. مهاجرت‌های دیتابیس (`docs/sql/`) – همه روی Supabase واقعی اجرا شده‌اند

| اسکریپت | محتوا |
|---|---|
| 1–11 | پایه، چندشرکتی، تغییرات، Wünsche |
| 12 | `staff_month_balance` + `save_month_balances` (Saldo ماهانه) |
| 13 | نیم‌روزها |
| 14 | `on_friday/on_saturday/on_sunday` |
| 15 | امنیت: anon بدون دسترسی، ثبت‌های Zeiterfassung غیرقابل تغییر، `correct_attendance` |
| 16 | `time_tracking`، `staff_pins`، `terminal_tokens`، `pin_failures` |
| 17 | `badges` (کارت چیپی)، `card_requires_pin`، `terminal_pair_codes`، `terminal_tokens.direction` |
| 18 | `requests.decision_note` |
| 19 | `org_features` (کلیدهای ویژگی هر شرکت) |
| 20 | `attendance_correction_requests`، `decide_correction_request`، `add_attendance_session` |
| 21 | `attendance_absences`، `set_absence`، `void_absence` |
| 22 | `staff.no_office` |
| 23 | `staff.personnel_no` (یکتا در هر شرکت) |
| 24 | `organizations.surcharge_settings` + `set_surcharge_settings` |
| 25 | `staff_vacation` (entitlement, carryover) |
| 26 | `organizations.overtime_settings`، `overtime_payouts`، `add_overtime_payout`، `void_overtime_payout` |
| STAGING-SETUP.sql | اسکریپت‌های ۱–۱۹ یکجا برای دیتابیس آزمایشی جدا در آینده |

## ۵. ویژگی‌های ساخته‌شده

### برنامه‌ریز (Dienstplaner)
- دو نوع: **آزمایشگاه** (`LabShiftScheduler.jsx`) و **عمومی** (`GenericShiftScheduler.jsx`)، چندشرکتی، نقش‌ها: Inhaber / Leitung / Mitarbeiter، ادمین در `/admin`.
- **مولد پلن «beste von 60 Varianten»** (`lib/planScore.js`): ۶۰ بار ساخته و بهترین انتخاب می‌شود (امتیاز: قوانین، شیفت کم‌نفر، پخش برابر ساعت، شب نسبت به قرارداد، آخر هفته، جفت شنبه/یکشنبه).
- پاس پرکننده فقط جاهای خالیِ خواسته‌شده را پر می‌کند. **نفر اضافه خاموش است** (تصمیم کاربر): صبح ۲ نفر می‌ماند، کمبود ساعت با «Monat abschließen» به ماه بعد می‌رود.
- ⚠️ کمبود ساختاری: با ترکیب فعلی (۶ تمام‌وقت + ۱ نفر ~۲۷ ساعت + ۴ مینی‌جاب) هر تمام‌وقت حدود **−۲۲ ساعت در ماه** کم می‌آورد؛ راه‌حل مدیریتی است (قرارداد/نفر/شیفت).
- Fortbildung در Wünsche مثل Frühdienst حساب می‌شود؛ مینی‌جاب حداکثر ۲ شب؛ «Befreit von Büro»؛ جدول پلن در کادر اسکرول‌شونده؛ Saldo در دیتابیس.
- **«Ziel» در «Zusammenfassung pro Mitarbeiter» با Soll = Vertrag:** اگر کلید `soll_vertrag` روشن باشد، هدف ماهانه دیگر ثابت ۱۶۰ نیست: ساعت هفتگی ÷ ۵ × روزهای دوشنبه–جمعهٔ غیرتعطیل منهای روزهای مرخصی (مارس ۲۰۲۶ = ۱۶۹٫۴، آوریل = ۱۵۴٫۰)، در هر دو برنامه‌ریز (`contractMonthTarget`, `sollCtx`). کلید خاموش = مثل قبل. تست: `zielvertrag_test`.
- **مرخصی تأییدشده خودکار در پلن:** بعد از «Personen aus Datenbank laden» و با هر انتخاب ماه، درخواست‌های **تأییدشده** (Urlaub/Fortbildung/Krank) و غیبت‌های ثبت‌شده توسط Leitung (به‌جز Unentschuldigt) آن ماه خودکار در فهرست Urlaub/Krank برنامه‌ریز می‌آیند (`OrgBar`، پیام «✓ n genehmigte Abwesenheit(en) … automatisch übernommen»). درخواست‌های باز **نه**. ورودی‌ها برچسب ماه دارند (`ym`، `dbId = id@ym`)؛ عوض‌کردن ماه آن‌ها را برمی‌دارد؛ تکرار نمی‌شوند؛ بعد از تصمیم در «Anträge» دوباره اجرا می‌شود. **لغو مرخصی تأییدشده:** Leitung در «Anträge» روی درخواست تأییدشده «Stornieren» (دلیل اجباری، متن «Storniert: …» برای کارمند؛ وضعیت denied) → در پلن خودکار برداشته می‌شود («n stornierte entfernt – bitte den Plan für diese Tage prüfen»)؛ پلنی که قبلاً ساخته شده خودکار عوض نمی‌شود. هر دو برنامه‌ریز. تست: `autourlaub_test`.
- **Personalnummer:** فیلد «Personal-Nr.» کنار ایمیل + دکمهٔ «# Fehlende Personalnummern vergeben» (فقط خالی‌ها، از ۱۰۰۱).
- چاپ/Excel پلن؛ جاهای اضافه «— (zusätzlich) —».

### Zeiterfassung (ثبت ورود/خروج)
- **ترمینال `/terminal` روی تبلت:** کسی روی تبلت وارد نمی‌شود. Leitung در «Anwesenheit → + Neues Terminal einrichten» کد یک‌بارمصرف `XXXX-XXXX` می‌سازد. ترتیب: اول **Kommen** (سبز) یا **Gehen** (قرمز) → بعد QR یا کارت چیپی (یا PIN، پشت کلید `terminal_pin_only`).
- **کارت چیپی:** کارت‌خوان USB (RFID 13,56 MHz MIFARE)، اختیاری «Karte + PIN erforderlich».
- **«📷 Stempeln» داخل اپ کارمند** (`components/ScanStamp.jsx`): دوربین داخل خود اپ کد ترمینال را می‌خواند → دیگر رفتن به Safari و ورود دوباره لازم نیست.
- **اصلاحات:** کارمند «Korrektur beantragen» / «Zeit beantragen»؛ Leitung «Übernehmen/Ablehnen» و «Zeiten bearbeiten» با Grund اجباری. ثبت اصلی هرگز عوض نمی‌شود (همه در `attendance_corrections`، علامت ✎).
- **یادآوری:** «Kommen fehlt» برای کارمند ۳۰ دقیقه، برای Leitung ۳ ساعت بعد از شروع شیفت؛ pop-up «Kommen/Gehen vergessen?».
- **غیبت‌ها:** Krank/Urlaub/Fortbildung/Sonstiges (بدون کسر)، Überstundenabbau/Unentschuldigt (با کسر). **بیماری هرگز از مرخصی کم نمی‌شود**؛ بیماری وسط مرخصی = Leitung «Krank» ثبت می‌کند و بر درخواست اولویت دارد (§۹ BUrlG).
- Anträge و Zugänge در اپ.

### Stundenzettel برای کارگزینی
- «Anwesenheit → Stundenzettel (für die Lohnabrechnung)»: ماه + «Alle» یا یک نفر → «Drucken / PDF»، هر نفر یک صفحهٔ A4 (`lib/timesheet.js`).
- بالا سمت راست: **Netto / Soll / Zeitkonto**. کادرها: **Zeitkonto** (Stand Monatsanfang / Veränderung / Stand Monatsende)، **Urlaub** (Verfügbar Monatsanfang / Genommen / Verfügbar Monatsende)، **Krankheit** (از اول سال)، Zuschlagsstunden.
- جدول روزانه: Datum، Wochentag، Beginn، Ende «(+1)»، Pause قانونی، Netto، Soll، Tag، Zeitkonto جاری، Zuschläge، Information. ردیف جمع در پایان.
- Urlaub/Krank/Fortbildung در روز کاری: Netto = Soll. شمار مرخصی/بیماری فقط روزهای کاری.
- ساعت شب فقط اگر بیش از ۲ ساعت بین ۲۲ تا ۶ باشد، منهای پاوز (۲۲:۰۰–۰۶:۰۰ − ۰۰:۳۰ = ۰۷:۳۰).
- تعطیلات: سراسری آلمان + یکشنبهٔ عید پاک و پنطیکاست.
- **Soll = Vertrag** (کلید ویژگی `soll_vertrag`، در `/admin` برای هر شرکت روشن می‌شود): ساعت هفتگی ÷ ۵ در دوشنبه–جمعهٔ غیرتعطیل (مارس ۲۰۲۶ = ۱۶۹:۲۴، آوریل = ۱۵۴:۰۰، دقیقاً مثل سیستم قبلی). روز کاری آزاد = منفی («Zeitausgleich»)، کار آخر هفته = مثبت. پیش‌فرض خاموش (Soll = پلن منتشرشده). در اپ کارمند هم همین‌طور.
- **Zuschläge (اختیاری، خود Leitung):** «Zuschläge einstellen» برای Nacht / Samstag / Sonntag / Feiertag: «kein Zuschlag» / «Prozent» / «Betrag pro Tag (€)» + Lohnart-Code → جدول «Zuschläge | Code | Gesamt».
- **Urlaubsanspruch:** «Urlaubsanspruch eintragen»: سال، «Tage im Jahr» و «Rest Vorjahr» برای هر نفر.

### اضافه‌کاری: Zeitkonto / Auszahlung / Gemischt (`lib/overtime.js`)
- «Anwesenheit → Überstunden: … – ändern» (هر شرکت، Leitung): **Zeitkonto** (همه به ماه بعد، پیش‌فرض) / **Auszahlung** (آخر هر ماهِ تمام‌شده همهٔ ساعت‌های مثبت پرداخت، حساب از صفر) / **Gemischt** (Leitung برای هر نفر و ماه «Überstunden auszahlen …» با ساعت + یادداشت؛ اشتباه = «Stornieren» با دلیل، هیچ حذفی). + Lohnart-Code اختیاری.
- فقط ساعت مثبت پرداخت می‌شود؛ منفی در حساب می‌ماند. هشدار سقف مینی‌جاب در متن راهنما.
- اثر یکسان در: Saldo Vormonat هر دو برنامه‌ریز (`planCarryHours`)، Stundenzettel (کادر Zeitkonto: «Ausgezahlt −X» + جدول «Überstunden ausgezahlt | Code | X Std.»)، Zeitkonto اپ کارمند (`walkBalance`).
- Stundenzettel در حالت پلن «Monatsabschluss (Plan/Vertrag)» را آخر ماه نشان می‌دهد تا پایان ماه = شروع ماه بعد. تست: `ueberstunden_test`.
- **Ziel در برنامه‌ریز عمومی بدون Soll=Vertrag:** ساعت هفتگی × روزهای باز ماه ÷ روزهای باز هفته (مثلاً چهارشنبه بسته در مارس ۲۰۲۶ → ۱۷۳٫۳). با کلید `soll_vertrag` همیشه دوشنبه–جمعه (۱۶۹٫۴) مثل سیستم قبلی. به کاربر توضیح داده شد.

### کلیدهای ویژگی هر شرکت
`lib/features.js` + جدول `org_features` + بخش «Funktionen nur für diese Firma» در `/admin`. کلیدها: `terminal_pin_only`، `soll_vertrag`.

### Keep-alive سوپابیس
- `app/api/keepalive/route.js` + `vercel.json` → `crons`: هر روز ساعت ۵ صبح (UTC) یک خواندن کوچک از دیتابیس تا پروژهٔ رایگان سوپابیس به‌خاطر بی‌استفادگی متوقف نشود. اختیاری: متغیر `CRON_SECRET` در Vercel (آن‌وقت فقط Vercel می‌تواند صدا بزند).

### امنیت و حقوقی
هدرهای امنیتی، `/impressum`، `/datenschutz`، فوتر، robots/sitemap؛ RLS روی همهٔ جدول‌ها.

## ۶. تصمیم‌های کاربر

- **نام هیچ برنامهٔ رقیب (از جمله سیستمی که شرکت قبلاً داشت) هرگز در برنامه، راهنماها، کد یا متن‌های مشتری نیاید.**

- «Inhaber» می‌ماند (نه «Hauptkonto»). صفحهٔ `/admin` مثل قبل برای ادمین.
- **نه:** «Rolle ändern»، «Stellvertretende Leitung»، تغییر ایمیل توسط کارمند.
- نفر اضافه در مولد پلن: **خاموش**.

## ۷. ایده‌های آینده (هنوز ساخته نشده)

- **فروش بین‌المللی (اول دبی):** انگلیسی + عربی (راست‌به‌چپ) + **«پروفایل کشور»** برای هر شرکت: زبان، روزهای آخر هفته (افغانستان: جمعه)، تعطیلات اسلامی (تقویم قمری)، ساعت کمتر در رمضان، پول (درهم/افغانی)، قانون کار. Inhaber زبان شرکت را انتخاب می‌کند و ادمین آن را می‌بیند. بعداً دری. Stundenzettel، Impressum و Datenschutz آلمانی می‌مانند. افغانستان: مشکل پرداخت/تحریم، اول با مشاور.
- پلن هفتگی/سالانه و حالت چرخشی (فقط برای مشتری سفارش‌دهنده، پشت کلید ویژگی).
- اعلان واقعی گوشی (Web Push) – نیازمند دامنه + سرویس ایمیل.
- خروجی DATEV / حسابداری حقوق؛ تعطیلات ایالتی آلمان.
- انبارداری و ثبت دما با حسگر (نقشه‌ها: `INVENTAR-PLAN.md`، `TEMPERATUR-PLAN.md`، `KUNDEN-ANPASSUNGEN.md` – باید در `docs/` گیت‌هاب گذاشته شوند).
- دیتابیس آزمایشی جدا بعد از Supabase Pro (با `STAGING-SETUP.sql`).
- قیمت‌گذاری: واقع‌بینانه ۳–۸ یورو برای هر نفر در ماه یا بستهٔ ثابت (رقیب Papershift ۴/۶/۹ یورو)؛ درآمد بیشتر با بستهٔ تخصصی آزمایشگاه. اپ‌استور فعلاً لازم نیست.

## ۸. حساب‌های تست

- ادمین: `mmeslami@gmail.com`
- شرکت A (Labor): `a-chef@test.de` (Inhaber)، `leitung@test.de`، `mitarbeiter@test.de` (Anna) – رمز تستی `Test12345!`
- شرکت B (allgemein): `b-chef@test.de`

## ۹. کار بعدی

1. آپلود `Upload-NUR-30-Aenderungen (روی ۲۶).zip` در **test** و امتحان: «Urlaubsanspruch eintragen» و کادرهای Urlaub/Krankheit در Stundenzettel؛ «📷 Stempeln» روی آیفون واقعی.
2. بعد PR از test به main.
3. برای شرکت واقعی آزمایشگاه در `/admin` کلید «Zeitkonto: Soll = Vertrag» را روشن کنید و Zuschläge (مثلاً Nacht ۲۰٪ کد 8027، Sonntag/Feiertag ۱۰۲٫۲۶ € در روز کد 1070/8002) و حق مرخصی را وارد کنید.
