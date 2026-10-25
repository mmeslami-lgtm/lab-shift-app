# Dienstplaner (SaaS) – خلاصهٔ کامل پروژه تا ۲۴ اکتبر ۲۰۲۶

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

## ۲. روال کار (تثبیت‌شده، از ۲۴ اکتبر بدون Pull request)

1. آپلود بسته در شاخهٔ **test** (گزینهٔ «Commit directly to the test branch»).
2. امتحان روی آدرس آزمایشی.
3. **همان زیپ** را در شاخهٔ **main** آپلود کنید («Commit directly to the main branch»). Pull request دیگر لازم نیست: چون کاربر قبلاً مستقیم در main آپلود کرده، test و main تاریخچهٔ متفاوت دارند و GitHub «Can't automatically merge» می‌گوید (بی‌خطر، ولی PR نسازید).
4. چک Vercel → Deployments. اگر خودکار نساخت: روی ردیف «⋯ → Promote».
5. «Delete branch» هرگز زده نشود.
6. بسته‌ها همیشه روی آخرین `main` ساخته می‌شوند و فقط فایل‌های تغییرکرده را دارند.

## ۳. آخرین بسته

- بستهٔ ۳۲ (پیش‌نویس + Monatswechsel) در `main` است.
- **`Upload-NUR-35-Impressum.zip`** (۲۵ اکتبر): Impressum و Datenschutz با اطلاعات صاحب برنامه (Mehran Eslami، Bohlkamp 21، 23564 Lübeck، mmeslami@gmail.com)؛ بند «Gesundheitsdaten» (Art. 9 DSGVO) در Datenschutz؛ بخش‌های USt-IdNr و Handelsregister برداشته شد (ندارد / گزارش نشده). تلفن: +49 176 34340216. Impressum کامل است؛ سایت آنلاین می‌ماند (تصمیم کاربر). چک شد: بدون Tracking، بدون Google Fonts، بدون ادعای «DSGVO-konform/rechtssicher». باز: کار کردن info@dienstigo.de (روی صفحهٔ اول) را کاربر چک کند. هم test هم main.
- حقوقی (تصمیم کاربر: فعلاً ارزان): AVV از روی قالب رایگان (مثلاً Bitkom-Muster) در گفتگوی بعد؛ مشاورهٔ رایگان IHK Lübeck؛ وکیل فقط برای «بررسی» بعد از اولین مشتری پولی.
- بستهٔ ۳۳ (Einsatzorte، طرح اول با جدول دستی نفر × روز) **فقط در test** است و **نباید به main برود**: کاربر طرح بهتری خواست (بخش ۱۰، مورد ۳). اسکریپت دیتابیس ۳۱ اجرا شده و جدول‌هایش برای طرح جدید دوباره استفاده می‌شوند.
- **برای گفتگوی بعدی:** زیپ شاخهٔ **test** را بفرستید («Code → Download ZIP» با شاخهٔ test)، چون کد بستهٔ ۳۳ (Route در اپ، «Ort:» در Stundenzettel، `work_locations`) فقط آنجاست.

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
| 27 | `my_role` – Leitung زمان‌های خودش را تأیید/ویرایش نمی‌کند |
| 28 | انواع درخواست (Mutterschutz، Elternzeit …)، `requests.cut_vacation`، Einspringen |
| 29 | `attendance_review_seen` («Zu prüfen» در Anwesenheit) |
| 31 | Einsatzorte: `work_locations`، `location_assignments` (draft/published)، `set_location_mode`، `save_work_location`، `save_location_draft`، تریگر `publish_locations` روی `schedule_months`؛ `discard_draft` محل‌ها را هم برمی‌گرداند |
| 30 | `discard_draft` (دور ریختن پیش‌نویس پلن)، `save_attendance_edits` (ثبت یکجای تغییرهای ساعت، همه یا هیچ)، رفع باگ `set_absence` (حالا هر ۱۲ نوع غیبت؛ قبلاً فقط ۶) |
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

### پیش‌نویس (Entwurf) – مورد ۲ صف، ۲۴ اکتبر
- **برنامه‌ریز (هر دو):** پلن روی صفحه فقط پیش‌نویس است؛ کارمندها همیشه فقط نسخهٔ `published` را می‌بینند. `lib/draftGuard.js` آخرین وضعیت ذخیره‌شده را نگه می‌دارد (`savedDays`، بعد از «Plan laden» / «Zwischenspeichern» / «Veröffentlichen»؛ نسخهٔ آرشیوی قدیمی = ذخیره‌نشده). تا وقتی فرق دارد: کادر زرد «● Nicht gespeicherte Änderungen» در PublishPanel، هشدار مرورگر هنگام بستن صفحه، هشدار هنگام عوض کردن ماه و «Personen laden». پیش‌نویس ذخیره‌شده: «✓ Entwurf gespeichert … sehen noch die veröffentlichte Fassung».
- **«Alle Änderungen verwerfen»** = همه‌چیز مثل قبل: پلن به نسخهٔ منتشرشده برمی‌گردد و اگر پیش‌نویسی (Zwischenspeichern یا منتظر Freigabe) در دیتابیس باشد با `discard_draft` پاک می‌شود (با سؤال). ماه بدون نسخهٔ منتشرشده: برگشت به آخرین ذخیره. مولد پلن و قوانینش دست نخورده.
- **Anwesenheit → «Zeiten bearbeiten (auch frühere Tage)»:** Korrigieren / Zeit nachtragen / Abwesenheit eintragen·ändern·aufheben فقط «vorgemerkt» می‌شوند. فهرست «n Änderungen für <Monat> – noch nicht gespeichert» با ✕ برای هر مورد، یک «Grund» برای همه، «Speichern (n)» → `save_attendance_edits` (یک تراکنش: همه یا هیچ؛ خطا روز و نفر را نام می‌برد)، «Abbrechen» = هیچ تغییری. فقط یک ماه در هر بار؛ هشدار هنگام رفتن به ماه دیگر، بستن پنجره یا صفحه. فرم «Abwesend …» در بالای پنجره (Nicht erschienen) مثل قبل فوری ثبت می‌کند.
- تست: کلیک‌به‌کلیک در مرورگر بدون صفحه با دیتابیس ساختگی (Labor ۱۶، Allgemein ۱۶، Anwesenheit ۲۱ مورد) + تست دیتابیس با نقش‌های واقعی در تراکنش لغوشده.

### Einsatzorte – طرح اول (بستهٔ ۳۳، فقط در test؛ با طرح بخش ۱۰ مورد ۳ جایگزین می‌شود)
- دکمهٔ «📍 Einsatzorte» در نوار پلن (`components/EinsatzorteDialog.jsx`). تب «Orte & Einstellung» (فقط Inhaber/Leitung): «Ein Arbeitsort» (پیش‌فرض، هیچ تغییری) / «Mehrere Einsatzorte» (`org_features.einsatzorte`)؛ فهرست محل‌ها: نام، آدرس (برای Route)، رنگ؛ هرگز پاک نمی‌شود، فقط «inaktiv». Stammort وجود ندارد (تصمیم کاربر): همه دستی در جدول.
- تب «Plan»: جدول نفر × روز مثل Wunschplan. محل را انتخاب کنید (قلم)، بعد: خانه = یک روز، اسم = همهٔ روزهای کاری آن نفر، عدد روز = همهٔ کسانی که آن روز شیفت دارند. روزهای بدون شیفت خاکستری؛ محل در روز بدون شیفت یا مرخصی = قرمز («⚠️ … entfernen»)؛ «n Schichten noch ohne Ort». «Übernehmen» فقط پیش‌نویس روی صفحه را عوض می‌کند.
- پیش‌نویس مثل پلن: محل‌ها جزو «Nicht gespeicherte Änderungen»اند؛ «Zwischenspeichern» → `save_location_draft`؛ «Veröffentlichen» (مستقیم یا از Freigaben) → تریگر نسخهٔ draft را published می‌کند؛ «Plan laden» محل‌های همان نسخه را می‌آورد؛ «Alle Änderungen verwerfen» محل‌ها را هم برمی‌گرداند.
- نمایش: در جدول پلن برچسب رنگی «📍 Filiale Nord» زیر اسم. اپ کارمند: زیر «nächste Schicht» و زیر روز انتخاب‌شده «📍 نام · آدرس» + دکمهٔ «Route» (آیفون: Apple Maps، بقیه: Google Maps). Stundenzettel: «Ort: …» در ستون Information. کارمند فقط published می‌بیند.
- ⚠️ هنوز نه: محل در **چاپ/PDF و Excel پلن** (فقط روی صفحه). اگر لازم شد، بستهٔ کوچک بعدی.
- تست: دیتابیس با نقش‌های واقعی شرکت B در تراکنش لغوشده (کارمند پیش‌نویس را نمی‌بیند، نمی‌تواند بنویسد، Labor رد می‌شود، Verwerfen برمی‌گرداند)؛ مرورگر: برنامه‌ریز ۱۵/۱۵، اپ کارمند آیفون/اندروید ۶/۶، Stundenzettel ۲/۲؛ تست‌های قبلی ۵۵/۵۵ بدون تغییر.

### Monatswechsel – ماه جدید از جایی شروع می‌شود که ماه قبل تمام شد (۲۴ اکتبر، قانون اصلی)
- `lib/monthTail.js`: ۷ روز آخر ماه قبل (نسخهٔ منتشرشده، وگرنه پیش‌نویس ذخیره‌شده) خوانده می‌شود (`loadMonthTail` → `tailCtx`) و مولد پلن آن‌ها را «روزهای قبل از روز ۱» می‌بیند. زیر فیلد ماه: «↪ Monatsübergang: Ende Oktober 2026 wird berücksichtigt». بدون پلن ماه قبل = مثل قبل.
- **شب‌کاری** (در Allgemein: هر شیفت با «Ruhe danach»): بلوکی که آخر ماه قبل در جریان است ادامه پیدا می‌کند تا روی‌هم **حداکثر ۴ شب پشت‌سرهم**، بعد **۲ روز آزاد (frei)**. اگر بلوک تمام شده بود یا نمی‌شود ادامه داد (مرخصی، Nachtbefreiung، سقف ۲ شب مینی‌جاب، ۶ روز پشت‌سرهم)، روزهای آزاد اول ماه جدید می‌آیند. بلوک روی شنبه تمام نمی‌شود (Sa+So با هم؛ مثل داخل ماه، بلوک روز جمعه تمام می‌شود).
- **شنبه آخر ماه → یکشنبه اول ماه:** همان شیفت شنبه برای همان نفر (`weekendPairPick`).
- **بعد از Spät روز آخر ماه، Früh در روز ۱ نه؛ حداکثر ۶ روز کار پشت‌سرهم** هم از روی ماه قبل حساب می‌شود (`consecutiveWorkDays`، و در Labor `keyOn`/`runLenIf` پاس پرکننده).
- هشدارها (`computeStatsAndWarnings(..., tail)`) هم مرز ماه را می‌بینند: طول بلوک «3 im Vormonat + …»، ۲ روز استراحت بعد از شب ماه قبل، Früh nach Spät روز ۱. پیام‌ها در Hinweise: «Monatswechsel: Anna setzt den Nachtdienst aus dem Vormonat fort (3 + 1 = 4 Nächte, bis Tag 1), danach 2 Tage frei».
- تست: هر دو مولد مستقیم در Node، ۶۰ پلن تصادفی برای هر حالت (نوامبر ۲۰۲۶ = شروع یکشنبه، اوت ۲۰۲۶ = شروع شنبه): ۲۹/۲۹ بررسی مرز ماه درست؛ بازبینی کل ماه در ۲۴۰ پلن: ۰ بلوک بیش از ۴ شب، ۰ نقض ۲ روز استراحت، ۰ Früh بعد از Spät، Sa=So در ۱۰۰٪ جفت‌های آخر هفته.

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

### Mobil stempeln (برای کارهای بدون محل ثابت، مثل پرستاری سیار)
- کلید ویژگی `mobil_stempeln`: در اپ کارمند دکمهٔ «⏱ Stempeln» → `components/MobileStamp.jsx` با Kommen/Gehen بزرگ، بدون ترمینال (و لینک «QR am Terminal scannen»). سرور: `/api/zeit` action `mobil` (زمان سرور، محافظت دوبار زدن ۶۰ ثانیه، رویداد با `badge_code = device_id = "mobil"`).
- کلید `mobil_standort` (اختیاری): فقط در لحظهٔ ثبت یک بار موقعیت گوشی گرفته می‌شود (`raw_payload: {lat, lng, acc}`، گرد به ۵ رقم)، بدون ردیابی مداوم؛ اگر کاربر اجازه ندهد، ثبت انجام نمی‌شود. Datenschutz به‌روز شد. ⚠️ برای مشتری: اطلاع به کارمندان و در صورت وجود موافقت Betriebsrat.
- Leitung در «Anwesenheit → Heute»: «📱» کنار ثبت موبایل یا «📍 Karte» (لینک OpenStreetMap). Stundenzettel: «mobil» در ستون Information.
- بدون مهاجرت دیتابیس (از `attendance_events.raw_payload` استفاده می‌شود).

### همه (کارمند، Leitung، Inhaber) خودشان ساعت می‌زنند
- در `/admin` هر حساب Leitung/Inhaber را می‌شود به یک «Person» از پلن وصل کرد (ستون Person، action `link_staff`؛ در ساخت حساب هم اختیاری).
- حساب وصل‌شده در برنامه‌ریز دکمه‌های «⏱ Stempeln» (موبایل یا QR) و «Meine Zeiten» (همان EmployeeTimes با Korrektur/Zeit beantragen) دارد.
- قانون دیتابیس (`my_role`, اسکریپت ۲۷، اجرا شد): Leitung نمی‌تواند زمان‌های **خودش** را تأیید/ویرایش/اضافه کند → Inhaber یا Leitung دیگر؛ Inhaber می‌تواند (با دلیل، ثبت‌شده). درخواست‌ها نیاز به محصول employee_app دارند.

### Erfassungsart توسط خود Leitung/Inhaber
- «Anwesenheit → Wie wird gestempelt?»: Nur Terminal / Nur Handy / Terminal und Handy + چک‌باکس Standort → RPC `set_time_modes` (کلیدهای `mobil_stempeln`, `nur_mobil`, `mobil_standort` در org_features). «Nur Handy» لینک QR را در MobileStamp پنهان می‌کند.
- صفحهٔ شروع: «Anmelden» یک منوی کشویی است (`components/LoginMenu.jsx`؛ hover روی کامپیوتر، لمس روی گوشی) با Mitarbeiter / Leitung / Inhaber → `/login?als=…`.
- `/login`: انتخاب نقش با کلید کشویی (Mitarbeiter / Leitung / Inhaber، در localStorage)، بعد ایمیل و رمز؛ `homeRoute(..., prefer)`.

### انواع درخواست + Mutterschutz/Elternzeit + Einspringen (اسکریپت ۲۸، اجرا شد)
- انواع: Urlaub، Fortbildung/Weiterbildung، Krank mit/ohne Attest، Freizeitausgleich (= ueberstunden، منفی)، Sonderurlaub، Dienstreise، Kur/Reha (credit)، **Mutterschutz** و **Elternzeit** (neutral: Soll 0). `lib/absence.js`: ABSENCE، REQUEST_TO_ABSENCE، اولویت (Mutterschutz > Elternzeit > Krank > …)، `elternzeitCut` (۱/۱۲ برای هر ماه کامل، فقط با `requests.cut_vacation` که Leitung در «Anträge» تیک می‌زند).
- اپ کارمند «Anträge»: کادر Urlaub verfügbar (Anspruch/Genommen/Beantragt)، کاشی‌های Urlaub/Krank/Freizeitausgleich، راهنمای هر نوع، هشدار بیش از مانده.
- Stundenzettel: Krankheit = krank + krank_ohne؛ Urlaub فقط urlaub؛ «Anspruch gekürzt (§ 17 BEEG)»؛ **eingesprungen** از `shift_changes` (kind cover/extra) + Zuschlag اختیاری «Einspringen» (پرسنت یا مبلغ در روز).

### Schulung (رایگان، بدون KI)
- `components/Schulung.jsx`: دوره‌ها برای Mitarbeiter (۷)، Leitung (۸)، Inhaber (۳)؛ عکس واقعی با هایلایت، «👉 Zeig mir» (اپ: تب‌ها؛ برنامه‌ریز: Anträge/Anwesenheit/Zugänge)، یک سؤال کوتاه در هر درس، پیشرفت در localStorage، جستجو در درس‌ها و FAQ. دکمه «🎓 Hilfe» در اپ کارمند و «🎓 Schulung» در برنامه‌ریز. فعلاً آلمانی؛ بعداً EN/FA و دستیار KI (Claude) روی همین.

### Anwesenheit «Zu prüfen» (جدول `attendance_review_seen`، اجرا شد)
- `lib/review.js`: موارد ۳۱ روز اخیر (از شروع Zeiterfassung): 📱/📍 ثبت موبایل، ✎ ورود/تغییر دستی، ⚠️ «Gehen fehlt» (>۱۲ ساعت)، ⚠️ «Nicht erschienen» (شیفت منتشرشده >۱۵ دقیقه شروع شده، بدون Kommen و بدون غیبت). هر مورد تا «Gesehen ✓» (یا «Alle gesehen») می‌ماند؛ مشترک برای همهٔ Leitungen؛ خود ثبت‌ها پاک نمی‌شوند.
- عدد روی دکمهٔ «Anwesenheit» = درخواست‌های باز + Zu prüfen. جدول «Heute» حالا جمع‌شده («Alle Stempelungen heute»).

### ترکیب منصفانهٔ شیفت‌ها (Früh/Mittel/Spät)
- مولد Labor: `pickBest(pool, day, kind)` با `kindCount` – کسی که از این نوع شیفت کمتر داشته جلوتر می‌آید (وزن ۰٫۲۵ کنار عقب/جلو بودن ساعت).
- `scorePlan(..., mixKeys)`: انحراف سهم هر نوع بین افراد (×۹۰۰) + ۱۲۰ برای هر نفر با «۰ از یک نوع رایج». Labor: F/M/S؛ Allgemein: شیفت‌های روزانه غیر از شب/quota.
- وزن‌ها ثانویه‌اند (مولد ۰٫۱، فقط روزهای کاری؛ امتیاز ×۱۶۰ و ۴۰) تا قوانین اصلی (شب‌ها، آخر هفته‌ها، Sa=So، ۲ روز استراحت بعد از شب) جلوتر بمانند. عدالت آخر هفته در امتیاز قوی‌تر شد (دامنه ×۶۰ + std ×۶۰).
- تست ۸×۶۰ نسخه با ۱۱ نفر: Sa≠So = ۰، کار در ۲ روز بعد از شب = ۰، دامنهٔ شب ≈ مثل قبل (۲٫۴)، دامنهٔ آخر هفته ۳٫۸ → ۲٫۶، و همهٔ تمام‌وقت‌ها هم Früh هم Spät (قبلاً در نیمی از اجراها نه).
- **Ziel = Vertrag** حالا پیش‌فرض: `soll_vertrag` برای همهٔ شرکت‌ها روشن شد و `create_organization` آن را برای شرکت‌های جدید روشن می‌کند.

### کلیدهای ویژگی هر شرکت
`lib/features.js` + جدول `org_features` + بخش «Funktionen nur für diese Firma» در `/admin`. کلیدها: `terminal_pin_only`، `soll_vertrag`، `mobil_stempeln`، `mobil_standort`.

### Keep-alive سوپابیس
- `app/api/keepalive/route.js` + `vercel.json` → `crons`: هر روز ساعت ۵ صبح (UTC) یک خواندن کوچک از دیتابیس تا پروژهٔ رایگان سوپابیس به‌خاطر بی‌استفادگی متوقف نشود. اختیاری: متغیر `CRON_SECRET` در Vercel (آن‌وقت فقط Vercel می‌تواند صدا بزند).

### دامنه و صفحهٔ شروع (Dienstigo)
- نام محصول: **Dienstigo**؛ دامنه `dienstigo.de` (IONOS، با Mail Basic: `info@dienstigo.de`) + `dienstigo.com`. DNS در IONOS: A `@` → `216.198.79.1`، CNAME `www` → مقدار ورسل؛ ورسل `dienstigo.de` را با 308 به `www.dienstigo.de` می‌برد.
- **`/`** = صفحهٔ معرفی عمومی (`app/page.js`، فونت‌ها با next/font: Bricolage Grotesque + Atkinson Hyperlegible؛ بدون قیمت). کسی که وارد شده خودکار به بخش خودش می‌رود (`components/SignedInRedirect.jsx`).
- **`/login`** = ورود برای همه، بعد هدایت بر اساس نقش (`lib/homeRoute.js`): Labor → `/labor`، عمومی → `/allgemein`، کارمند → `/mitarbeiter`، ادمین بدون شرکت → `/admin`، وگرنه `/profil`.
- **برنامه‌ریز آزمایشگاه از `/` به `/labor` منتقل شد** (لینک‌ها در ProfileView و ScheduleReview به‌روز شد). manifest: نام Dienstigo، `start_url: /login`. robots/sitemap/layout با `https://www.dienstigo.de`.
- **`/demo` = رندگانگ (تور تعاملی)**: `components/DemoTour.jsx`، پنج فصل (Dienstplan Labor، Dienstplan allgemein، Mitarbeiter-App، Stempeln، Stundenzettel؛ فصل allgemein یک «Beispielansicht» کشیده‌شده است، نه عکس – بعداً با عکس واقعی جایگزین شود)، عکس‌های واقعی در `public/demo/*.webp` (از راهنماها)، کادر هایلایت با درصد، Weiter/Zurück/پیکان‌ها، «Abspielen» خودکار هر ۶٫۵ ثانیه. صفحهٔ قدیمی پیش‌نمایش کارمند از `/demo` برداشته شد. لینک «Rundgang» در صفحهٔ شروع.
- سوپابیس → Authentication → URL Configuration: Site URL `https://www.dienstigo.de` + Redirect URLs `https://www.dienstigo.de/**`, `https://dienstigo.de/**` (آدرس‌های قدیمی بمانند).

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
- صندوق پیام / اعلان داخل اپ برای کارمند: ۲۴ اکتبر اشتباهی ساخته و همان روز کامل از دیتابیس برگردانده شد (مهاجرت‌های `mitteilungen` و `mitteilungen_rueckgaengig`). جزو صف نیست.
- خروجی DATEV / حسابداری حقوق؛ تعطیلات ایالتی آلمان.
- انبارداری و ثبت دما با حسگر (نقشه‌ها: `INVENTAR-PLAN.md`، `TEMPERATUR-PLAN.md`، `KUNDEN-ANPASSUNGEN.md` – باید در `docs/` گیت‌هاب گذاشته شوند).
- دیتابیس آزمایشی جدا بعد از Supabase Pro (با `STAGING-SETUP.sql`).
- قیمت‌گذاری: واقع‌بینانه ۳–۸ یورو برای هر نفر در ماه یا بستهٔ ثابت (رقیب Papershift ۴/۶/۹ یورو)؛ درآمد بیشتر با بستهٔ تخصصی آزمایشگاه. اپ‌استور فعلاً لازم نیست.

## ۸. حساب‌های تست

- ادمین: `mmeslami@gmail.com`
- شرکت A (Labor): `a-chef@test.de` (Inhaber)، `leitung@test.de`، `mitarbeiter@test.de` (Anna) – رمز تستی `Test12345!`
- شرکت B (allgemein): `b-chef@test.de`

## ۹. کار بعدی

1. گفتگوی جدید: زیپ شاخهٔ **test** + خواندن همین فایل → ساخت مورد ۳ به طرح جدید (بخش ۱۰)، در دو بسته.
2. سپس مورد ۴ صف (Wochenrotation).

## ۱۰. صف کارها (به ترتیب؛ هر کدام یک بستهٔ جدا و تست‌شده)

۲. ✅ **پیش‌نویس (Entwurf) در دو جا** – ساخته شد (بستهٔ ۳۱، منتظر امتحان کاربر):
   - الف) برنامه‌ریز: وقتی ماهِ منتشرشده را «Bearbeiten» می‌کنم، تغییرات فقط پیش‌نویس باشد. کارمندها تا «Speichern / Veröffentlichen» همان پلن قبلی را ببینند. «Verwerfen» یا بستن بدون ذخیره = همه‌چیز مثل قبل. هشدار اگر صفحه با تغییرات ذخیره‌نشده بسته شود.
   - ب) Anwesenheit → «Zeiten bearbeiten (auch frühere Tage)»: تغییرهای یک ماه جمع شوند (فهرست «n Änderungen») و فقط با «Speichern» یکجا با دلیل ثبت شوند. «Abbrechen» = هیچ تغییری.

۲ب. **حفاظت بیشتر از «Krank» (تصمیم کاربر ۲۵ اکتبر؛ بستهٔ کوچک، قبل یا همراه مورد ۳):** Leitung «Krank» را می‌بیند (لازم برای Entgeltfortzahlung، پلن و Stundenzettel)؛ برداشتن کامل «Krank» رد شد. به جایش:
   - **دسترسی:** دلیل غیبت (Krank، Krank ohne Attest، Kur/Reha، Mutterschutz …) و یادداشتش فقط برای Inhaber و Leitung؛ نقش «Schichtplaner» فقط «abwesend» بدون دلیل. (اول بررسی: RLS روی `attendance_absences` و `requests`، نمایش در برنامه‌ریز، AttendanceDialog، Stundenzettel؛ تست با نقش واقعی planner.)
   - **فیلد یادداشت غیبت:** راهنما «Keine Diagnose eintragen» (تشخیص پزشکی ننویسید).
   - **Datenschutz:** جملهٔ «nur für die Leitung sichtbar» با این محدودیت دقیق شود (Schichtplaner ohne Grund).
   - مثل قبل: همکاران دلیل را نمی‌بینند؛ هر کارمند غیبت‌های خودش را در اپ می‌بیند.

۳. **Einsatzorte – طرح جدید (تصمیم کاربر ۲۴ اکتبر؛ فقط Dienstplaner allgemein).** مثال: شرکت پرستاری سیار که پرسنل را به چند محل می‌فرستد؛ هر محل شیفت، ساعت و تعداد نفر خودش را دارد.
   - **فعال‌سازی فقط با ادمین (تصمیم کاربر ۲۵ اکتبر):** ادمین در `/admin` → «Funktionen nur für diese Firma» برای هر شرکت تعیین می‌کند کدام حالت‌ها در دسترس‌اند: «Mehrere Standorte» (`einsatzorte_standorte`) و/یا «Touren mit Einsätzen» (`einsatzorte_touren`). بدون فعال‌سازی ادمین هیچ‌چیز از این‌ها در شرکت دیده نمی‌شود (پیش‌فرض: Ein Ort). Inhaber/Leitung شرکت فقط بین حالت‌هایی که ادمین آزاد کرده انتخاب و آن‌ها را تنظیم می‌کند. این جای کلید شرکت‌محور `org_features.einsatzorte` بستهٔ ۳۳ را می‌گیرد (`set_location_mode` باید آزاد بودن توسط ادمین را چک کند). پایهٔ فروش جدا/قیمت جدا برای این حالت‌ها.
   - **کلید بالای صفحه** (در تنظیمات برنامه‌ریز، نه در نوار پلن؛ فقط اگر ادمین آزاد کرده): «Ein Arbeitsort» (پیش‌فرض، هیچ تغییری) / «Mehrere Einsatzorte». با روشن کردن، برای هر محل یک کارت باز می‌شود:
     - خانهٔ اول **اسم محل** + **کد کوتاه** (به جای رنگ؛ تصمیم کاربر، مثلاً «N1»، «SÜD»؛ در پلن، چاپ سیاه‌وسفید و Excel دیده می‌شود) + آدرس برای Route؛
     - زیرش **شیفت‌های همین محل**: خود کاربر اسم و ساعت را تعیین می‌کند (Früh، Spät، Nacht …)، تعداد نفر برای روزهای عادی و آخر هفته/تعطیل، تیک «Ruhe danach» برای شب؛
     - زیرش **Mitarbeiter**: Inhaber/Leitung برای **این ماه یا این هفته** تعیین می‌کند چه کسانی در این محل هستند. حالت دوره را کاربر انتخاب می‌کند: «monatlich» یا «wöchentlich» (هر هفته Mo–So تیم خودش).
   - **یک نفر می‌تواند در چند محل باشد** (هم در یک ماه، هم در هفته‌های مختلف)، ولی هرگز دو شیفت در یک روز.
   - **پلن خودکار:** مولد برای همهٔ محل‌ها با هم پلن می‌سازد؛ هر شیفت فقط از تیم همان محل در همان دوره پر می‌شود. قوانین برای هر نفر روی **همهٔ محل‌ها با هم**: ساعت ماهانه/Ziel، ۲ روز آزاد بعد از شب، بلوک شب ۲–۴، Sa=So، حداکثر ۶ روز پشت‌سرهم، Früh nach Spät نه، Monatswechsel.
   - ایدهٔ فنی: شیفت‌های هر محل در مولد Allgemein کلیدهای جدا می‌گیرند (مثلاً `L1:F`) و یک قید «eligible(نفر، کلید، روز)» = عضو تیم آن محل در آن دوره، در همهٔ pool های مولد (پرکننده، شب‌ها، Wünsche، weekendPairPick، پاس پرکننده). شیفت‌های پایهٔ F/S در حالت چندمحلی خاموش. `scheduled_shifts` یک ستون `location_id` می‌گیرد؛ محل از خود شیفت معلوم است (جدول دستی `location_assignments` بستهٔ ۳۳ دیگر لازم نیست).
   - **نمایش:** تب برای هر محل + «Alle»؛ اپ کارمند محل و «Route» خودکار از شیفت؛ Stundenzettel «Ort: …»؛ چاپ هر محل یک صفحه.
   - **دو بسته:** (الف) تنظیمات محل‌ها/شیفت‌ها/تعداد/تیم ماهانه یا هفتگی + پلن دستی برای هر محل + اپ/Stundenzettel؛ (ب) مولد خودکار چندمحلی با همهٔ قوانین + چاپ. هر کدام تست‌شده.

۳ب. **Touren / چند Einsatz در یک روز** (پیشنهاد، ۲۵ اکتبر؛ معمول در ambulante Pflege و خدمات سیار مثل Sanitär/Hausmeister): یک نفر در یک روز به چند جا می‌رود (مثلاً ۲ ساعت A، ۲ ساعت B، ۲ ساعت C)؛ ساعت کار = جمع روز.
   - تنظیم شرکت «Arbeitsort-Modell»: Ein Ort / Mehrere Standorte (ganze Schicht = مورد ۳) / **Touren mit Einsätzen**.
   - دو سطح: **Dienst** آن روز (مثلاً 07:00–15:00؛ همهٔ قوانین پلن روی همین سطح) و داخلش **Einsätze** به ترتیب: محل (کد)، از–تا. بین Einsätze **Fahrzeit**.
   - تنظیم «Fahrzeit zählt als Arbeitszeit» (پیش‌فرض بله): ساعت روز = از شروع اولین تا پایان آخرین Einsatz منهای Pause؛ اگر نه: جمع Einsätze. ArbZG (Pause، ۱۰ ساعت، ۱۱ ساعت استراحت) روی کل روز. (در آلمان رفت‌وآمد بین مشتری‌ها معمولاً Arbeitszeit است؛ جزئیات با مشاور، بدون قول حقوقی.)
   - اپ کارمند: فهرست Einsätze روز به ترتیب، هر کدام با آدرس و «Route». اختیاری: «Einsatz beginnen/beenden» با Mobil stempeln. Stundenzettel: Beginn اول، Ende آخر، تعداد Einsätze، Fahrzeit، Netto.
   - Datenschutz: اگر محل = خانهٔ بیمار/مشتری، کارمند فقط Einsätze خودش را می‌بیند.
   - **تصمیم کاربر (۲۵ اکتبر): الگوی ثابت هفتگی، خودکار پخش می‌شود** (نه چیدن دستی هر روز):
     - برای هر محل/مشتری: روزهای هفته، ساعت (ثابت یا بازهٔ مجاز مثلاً 07:30–09:00)، مدت (مثلاً ۳۰ دقیقه)، از کی تا کی معتبر، «Pause» (مثلاً مشتری در بیمارستان).
     - برنامه Einsätze هر روز را بین کسانی که آن روز Dienst دارند پخش می‌کند و برای هر نفر Tour به ترتیب زمانی می‌سازد: بدون هم‌پوشانی، با Fahrzeit بین Einsätze، داخل Dienst آن نفر؛ ترجیح «Bezugspflege» (همان نفر برای همان مشتری تا جای ممکن). Einsatz بدون نفر = هشدار.
     - Fahrzeit در مرحلهٔ اول: یک مقدار ثابت قابل تنظیم (مثلاً ۱۵ دقیقه) یا برای هر جفت محل دستی؛ محاسبهٔ واقعی با نقشه بعداً (نیاز به سرویس نقشه).
     - مدیر می‌تواند بعد از پخش خودکار، Einsätze را دستی جابه‌جا کند (پیش‌نویس مثل پلن، بعد Veröffentlichen).
     - ترتیب ساخت: بعد از مورد ۳؛ احتمالاً در ۲–۳ بسته (الگوها و نمایش، پخش خودکار، زمان/Stundenzettel).

۴. **چرخش هفتگی (Wochenrotation):** کلید دست هر مدیر در برنامه‌ریز، ترتیب شیفت‌ها قابل انتخاب (مثلاً Früh → Mittel → Spät). قانون کار همیشه اول. Wünsche می‌توانند ترتیب را موقتاً به هم بزنند.

۵. **بررسی زندهٔ ArbZG هنگام ویرایش دستی پلن:** استراحت کمتر از ۱۱ ساعت، بیش از ۱۰ ساعت در روز، بیش از ۶ روز پشت‌سرهم و غیره، با هشدار.

۶. **جابه‌جایی شیفت در اپ** (پیشنهاد کارمند ← قبول همکار ← تأیید مدیر)، شیفت‌های باز، خروجی حقوق CSV آمادهٔ DATEV، اعلان Push.

**قوانین اصلی که نباید به هم بخورد:** شب‌ها و آخر هفته‌ها برای تمام‌وقت‌ها تا جای ممکن یکسان؛ شنبه و یکشنبه شیفت یکسان برای هر نفر؛ بعد از شیفت شب ۲ روز آزاد؛ **Monatswechsel:** شروع ماه جدید ادامهٔ پایان ماه قبل است (شب‌کاری ادامه تا روی‌هم حداکثر ۴ شب پشت‌سرهم، یا بعد از پایانش ۲ روز آزاد؛ شنبهٔ آخر ماه → یکشنبهٔ اول ماه همان شیفت) – ✅ ساخته شد (بستهٔ ۳۲).
