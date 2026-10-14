# نسخهٔ تکمیلی سند پروژه — اکتبر ۲۰۲۶ (بعد از بخش ۱۰ در PROJEKT.md)

> این فایل را همراه `PROJEKT.md` به چت تازه بده. هیچ رمز یا کلیدی در آن نیست.

## ۱۱. تغییرات این دوره

### چاپ / PDF برای تابلو
- دکمهٔ «Drucken / PDF (Aushang)» کنار دکمهٔ Excel، در هر دو Dienstplaner. کد مشترک: `lib/printPlan.js`.
- پنجرهٔ چاپ مرورگر (با پیش‌نمایش) مستقیم روی همان صفحه باز می‌شود (iframe پنهان)؛ پلن روی صفحه دست نمی‌خورد. فقط روی iPhone/iPad زبانهٔ تازه باز می‌شود.
- دو برگهٔ A4 افقی: «nach Schicht» (هر ردیف ۷ روز، دوشنبه اول، شیفت‌ها چپ، نام‌ها داخل خانه، `unbesetzt` قرمز، ردیف `Abwesend`) و «nach Mitarbeitenden». شنبه/یکشنبه سرستون تیره، روزهای عادی روشن.
- مرخصی = `U`؛ بیماری **هرگز** `K` نیست، فقط `A` (abwesend) — ثابت `SICK_CODE` در `lib/printPlan.js`.
- اگر پلن تغییر منتشرنشده دارد، قبل از چاپ سؤال؛ روی برگه «Entwurf» یا «Veröffentlichte Fassung» + تاریخ چاپ.

### قوانین تولید پلن (هر دو Dienstplaner)
- **شب‌کاری منصفانه:** سهم هر نفر = کل شب‌ها × (روزهای حاضر او ÷ مجموع روزهای حاضر همه) (+ حداکثر ۲ شب بدهی ماه قبل در Labor). اولویت با کسی که عقب است؛ حداکثر = سهم گردشده + ۱؛ بیشتر فقط اگر کس دیگری نباشد (یادداشت در Hinweise).
- **شنبه = یکشنبه (قانون محکم):** برای شنبه فقط کسی انتخاب می‌شود که یکشنبه همان شیفت را هم بتواند (مرخصی، استراحت بعد از شب، روز ششم متوالی، سقف ساعت بررسی می‌شود). بلوک شب هیچ‌وقت شنبه تمام نمی‌شود. استثنا: مرخصی/بیماری فقط در یکی از دو روز، یا تغییر دستی (هیچ‌چیز خودکار تغییر نمی‌کند).
- نتیجهٔ شبیه‌سازی (۹ نفر، دو نفر مرخصی، ۴۰ ماه): قبل بدترین ۷–۸ شب، بعد ۵؛ جفت‌های ناهمسان آخر هفته از ۲۳ از ۴۸۰ به ۰.

### باگ مهم: پاک شدن پلن بعد از خواب کامپیوتر — رفع شد
علت: Supabase بعد از بیدار شدن توکن را تمدید می‌کند؛ `ProductGate` و `PasswordGate` این را «ورود تازه» حساب می‌کردند و صفحه را از نو می‌ساختند. حالا فقط تغییر کاربر یا خروج حساب می‌شود.

### Dienstplaner allgemein: Öffnungstage و Betriebsschließung
- کارت «Öffnungstage» بالای بخش Feiertage: یک دکمه برای هر روز هفته (پیش‌فرض هر ۷ روز)، تیک «An Feiertagen geschlossen» (فقط Leitung/Inhaber)، و «Ganzer Betrieb geschlossen in diesem Monat» (مثلاً `24-31`، دکمهٔ «Übernehmen»).
- روزهای بسته: هیچ شیفتی، روی جدول/چاپ/Excel «geschlossen»؛ هدف ساعت = ساعت هفتگی ÷ تعداد روزهای باز هفته × روزهای باز ماه (بدون مرخصی). با ۷ روز باز دقیقاً فرمول قبلی. قانون «۲ شنبه/۲ یکشنبه» فقط وقتی آخر هفته باز است.
- اپ کارمند: روزهای Betriebsschließung با «zu» و متن «Der Betrieb ist an diesem Tag geschlossen.»
- Dienstplaner Labor تغییری نکرده (آزمایشگاه همیشه باز).
- باگ رفع‌شده: در allgemein هدف ماهانهٔ تمام‌وقت‌ها با سقف ۱۶۰ ساعت بریده می‌شد؛ در ماه با ۲۲ روز کاری (۱۶۵ ساعت لازم) روزهای آخر ماه (مثلاً جمعه ۳۰ اکتبر) فقط ۱ نفر در هر شیفت می‌ماند. حالا تمام‌وقت تا سقف ۱۹۰ (`FULLTIME_MONTHLY_CEILING`)، پاره‌وقت همچنان ۱۶۰. شبیه‌سازی کلینیک ۹ نفره Mo–Fr: روزهای کم‌نیرو از ۲۰ به ۰.
- دیتابیس: `docs/sql/10-opening-days-schema.sql` — **روی Supabase واقعی با Connector اجرا شده** و با نقش‌های واقعی در تراکنش برگشت‌خورده تست شد (۱۰ بررسی: Leitung می‌نویسد، شرکت دیگر نه، کارمند فقط می‌خواند، anon هیچ). ستون‌ها: `organizations.open_weekdays`، `organizations.closed_on_holidays`؛ جدول `month_closures`؛ توابع `set_opening_days`، `set_month_closed_days`.

### ساعت کاری، اضافه‌کاری و Saldo (**عمداً فقط Dienstplaner allgemein** — تصمیم کاربر)
- **Ziel** = ساعت قرارداد همان ماه: ساعت هفتگی ÷ روزهای باز هفته × روزهای باز ماه (بدون مرخصی) **± Saldo ماه‌های قبل** (اضافه‌کاری قبلی → Ziel کمتر = جبران؛ کم‌کاری قبلی → Ziel بیشتر). سقف: تمام‌وقت ۱۹۰.
- **پخش روزهای آزاد:** کسی که ساعتش برای «هر روز» کافی نیست، روزهای آزادش در کل ماه پخش می‌شود (نه همه در آخر ماه).
- **اضافه‌کاری فقط وقتی لازم است** تا تعداد خواستهٔ هر شیفت پر شود: اول تمام‌وقت‌ها (تا ۱۹۰)، بعد پاره‌وقت‌ها (حداکثر ۲۵٪ بالای Ziel)، Minijob هرگز. یادداشت در Hinweise.
- **Saldo در دیتابیس:** «Monat abschließen & archivieren» برای هر نفر یک ردیف در `staff_month_balance` می‌نویسد (ساعت قرارداد، ساعت پلن، کمبود شنبه/یکشنبه/شب). دوباره زدن همان ماه را بازنویسی می‌کند (دوبار شمرده نمی‌شود). Saldo هر ماه = جمع ماه‌های قبل. دکمهٔ «Alle Salden löschen» با ورود شرکت نیست (چیزی پاک نمی‌شود). بدون ورود شرکت مثل قبل در مرورگر.
- نمایش: ستون «Saldo Vormonat»: `+` = اضافه‌کاری (Ziel کمتر)، `−` = کم‌کاری. Saldo بر اساس ساعت **پلن** است، نه ساعت واقعی کار (بعداً با Zeiterfassung).
- دیتابیس: `docs/sql/12-hour-balance-schema.sql` — روی Supabase واقعی اجرا و با نقش‌های واقعی تست شد (۶ بررسی). تابع `save_month_balances(p_org, p_year, p_month, p_rows)`.
- Dienstplaner Labor عمداً بدون تغییر است (Saldo در مرورگر، Ziel با سقف ۱۶۰). به Labor منتقل نشود مگر کاربر بخواهد.

### نیم‌روز (فقط Dienstplaner allgemein)
- دکمهٔ هر روز در «Öffnungstage» با هر کلیک: ganztags → nur vormittags → nur nachmittags → geschlossen. برای یک ماه: «Nur vormittags/nachmittags geöffnet (dieser Monat)» کنار Betriebsschließung (یک «Übernehmen» برای هر سه).
- شیفت صبح/عصر: شروع قبل از ۱۲ = Vormittag، وگرنه Nachmittag؛ قابل انتخاب دستی («An halben Tagen gehört die Schicht zu …»). در نیم‌روز فقط شیفت‌های همان نیمه؛ در Ziel نیم‌روز = نصف روز. نمایش: جدول، چاپ («nur vorm./nachm.»)، Excel، اپ کارمند («½»).
- دیتابیس: `docs/sql/13-half-days-schema.sql` — روی Supabase واقعی اجرا و تست شد (۶ بررسی). `organizations.half_day_config` (`weekdays`, `shifts`)، `month_closures.am_days/pm_days`؛ توابع `set_opening_days` و `set_month_closed_days` یک پارامتر اختیاری بیشتر دارند (فراخوانی قدیمی کار می‌کند).

### Labor: Frühdienst یک‌نفره در کمبود نیرو (تصمیم کاربر)
- تولید پلن در دو دور: ۱) هر شیفت نفر اولش را می‌گیرد (Spät/Nacht هیچ‌وقت به خاطر نفر دوم صبح خالی نمی‌ماند)، ۲) نفرات اضافه: اول Mitteldienst و شیفت‌های اضافه، **نفر دوم Frühdienst آخر**. در کمبود: «Frühdienst mit 1 Person (Personalmangel – erlaubt …)» در Hinweise، در جدول «— 1 Person (Mangel) —»، در چاپ/Excel «(1 Person)» به‌جای «unbesetzt» قرمز. هیچ قانونی شکسته نمی‌شود. شبیه‌سازی ۶ نفر: خالی‌ماندن Spätdienst از ۲۲۸ به ۱۷، «۲ نفر صبح ولی عصر خالی» از ۲۲۱ به ۰.

### Labor: «Krankmeldung / Ausfall» با پیشنهاد جایگزین
- دکمه کنار «Drucken / PDF» → شخص + روزها → حداکثر ۳ «Möglichkeit» از بهترین به بدترین (`lib/sickSuggest.js`, `components/SickCoverDialog.jsx`): یک نفر برای همه / پخش بین چند نفر / Umbesetzung همان روز (نفر دوم صبح یا Mitteldienst جابه‌جا، صبح یک‌نفره). قوانین سخت هرگز شکسته نمی‌شوند (مرخصی/بیماری/Frei، استراحت ۲ روز بعد از شب، بلوک شب ≤۴، ۱۱ ساعت، ≤۶ روز پشت‌سرهم، nightExempt/weekendExempt، سقف ساعت). رتبه‌بندی: Einspringen کمتر در این ماه (از `shift_changes`)، ساعت کمتر از Ziel، تغییر کمتر. برای شب، حذف شیفت‌های جایگزین در ۲ روز استراحت به‌صورت «zusätzlich … entfällt» صریح نشان داده می‌شود.
- «Übernehmen» فقط همان خانه‌ها را عوض می‌کند (زرد) و بیماری را در فهرست Krankmeldungen ثبت می‌کند؛ نمایش به کارمندان فقط بعد از «Veröffentlichen» (در حالت «Plan bearbeiten» به‌عنوان Einspringen). اگر هیچ راهی بی‌قانون‌شکنی نبود: «Nur austragen». تست: ۶۷ حالت شبیه‌سازی بدون حتی یک قانون‌شکنی + تست مرورگر.

### Labor: شیفت‌های میانی جمعه/شنبه/یکشنبه
- برای هر شیفت اضافه (Mitteldienst، Büro، شیفت‌های خود کاربر) در Dienstplaner Labor سه تیک: «Freitag» (پیش‌فرض روشن)، «Samstag»، «Sonntag» (پیش‌فرض خاموش). دوشنبه تا پنجشنبه همیشه، تعطیلات رسمی هرگز. برای «Täglich» و «Kontingent/Monat». شنبه و یکشنبه هم همان نفر (قانون جفت آخر هفته).
- ذخیره با انتشار در `shift_definitions` (`on_friday`, `on_saturday`, `on_sunday`) و بازگشت با «Plan bearbeiten». دیتابیس: `docs/sql/14-middle-shift-days-schema.sql` (روی Supabase واقعی اجرا شد؛ فقط ستون جدید با مقدار پیش‌فرض رفتار قبلی).

### اعلان «Plan wartet auf Freigabe» (داخل برنامه)
- وقتی Schichtplaner پلنی را «Zur Freigabe einreichen» می‌کند، Leitung و Inhaber در نوار بالای Dienstplaner یک نوار قرمز می‌بینند («Ein Plan wartet auf deine Freigabe: November 2026 · Jetzt prüfen» → `/freigaben`) و در `/freigaben` هم یک نوار. هر ۶۰ ثانیه و هنگام برگشت به پنجره خودکار چک می‌شود. Schichtplaner و کارمندان آن را نمی‌بینند.
- **ایمیل هنوز نیست:** نیاز به دامنهٔ اختصاصی + سرویس ایمیل (Brevo/Mailjet/Resend، کلید فقط در Vercel، AVV). کار باز بعد از انتخاب نام و دامنه.

### /admin: نام شرکت و E-Mail
- «Umbenennen» کنار نام هر شرکت (نام تکراری رد می‌شود)؛ «E-Mail ändern» کنار هر حساب (بدون ایمیل تأیید، رمز همان می‌ماند؛ ایمیل تکراری رد؛ ایمیل ادمین دیگر محافظت‌شده). هر دو در `admin_log`.

### Spätdienst اختیاری (فقط Dienstplaner allgemein)
- در allgemein فقط «Frühdienst» از پیش هست. «+ Spätdienst hinzufügen» در «Schichtzeiten» آن را اضافه می‌کند (با سطل زباله برداشته می‌شود). پلن ذخیره‌شده‌ای که Spätdienst دارد، هنگام باز شدن آن را خودش روشن می‌کند. Labor بدون تغییر (F/S/N ثابت).

### ظاهر «Klares Blau» (همهٔ صفحه‌ها)
- انتخاب کاربر از سه نمونه. Dienstplanerها: کل ظاهر در `app/globals.css` (بخش «Erscheinungsbild Klares Blau»): زمینهٔ آبی ملایم `#E9EEF8`، عنوان صفحه نوار آبی تیره `#243B6B`، کارت‌ها با نوار بالایی آبی و سایهٔ نرم، رنگ teal قبلی همه‌جا آبی `#185FA5`. صفحه‌های با استایل درون‌خطی (اپ کارمند، /freigaben، /konto، /profil، /admin، دمو): ثابت `PAPER` = `#E9EEF8`، کارت‌های اپ کارمند با حاشیهٔ `#CBD8EE`. برگهٔ چاپ تغییر نکرد.
- دکمه‌ها: حاشیهٔ پررنگ‌تر (۱٫۵px، `#93A7CB` / `#9AAED0`) و متن یک درجه بزرگ‌تر (در Dienstplanerها از `globals.css`، در بقیه از ثابت‌های `btn`/`ghost`). در Dienstplanerها «Abmelden» بالای صفحه، سمت راست، بیرون نوار آبی عنوان، قرمز تیره (`.kb-logout`)؛ در OrgBar دیگر نیست. در /profil و /freigaben جدا از بقیهٔ دکمه‌ها. خطوط کم‌رنگ (جدول، کادر تنظیمات، فیلدها) در `globals.css` پررنگ‌تر شدند.

### دکمهٔ ساخت پلن (هر دو Dienstplaner)
- «Dienstplan erstellen» / «Neu generieren» حالا واکنش می‌دهد: «Moment …» با آیکون چرخان، بعد پیام «Plan erstellt um HH:MM:SS Uhr» یا «Neu erstellt … – N Einträge anders als vorher» (یا «gleiches Ergebnis …» اگر توزیع دیگری ممکن نیست).

### Wünsche (اپ کارمند ↔ Leitung)
- اپ کارمند، زبانهٔ «Wünsche» (`components/EmployeeWishes.jsx`): «Frei» یا «Arbeiten» (با شیفت)، بازهٔ تاریخ (فقط امروز به بعد)، یادداشت → «Hinzufügen» (پیش‌نویس، فقط خودش می‌بیند) → یک دکمه «An die Leitung senden (N)». وضعیت‌ها: نوشته‌نشده / گسیل‌شده (قابل «Zurückziehen») / genehmigt / abgelehnt + «Antwort».
- Dienstplaner: دکمهٔ «Wünsche» در نوار بالا (قرمز با «· N offen» اگر منتظر است) → پنجرهٔ `components/WishesDialog.jsx`: «Genehmigen» / «Ablehnen» (دلیل اختیاری که کارمند می‌بیند) / «Wieder öffnen»؛ «Genehmigte Wünsche in den Plan übernehmen» وارد فهرست Wünsche همان ماه می‌کند (بدون تکرار؛ «Frei» = آن روز برنامه‌ریزی نشود). فقط با «Neu generieren» اثر می‌کند — هیچ‌چیز خودکار نیست.
- دیتابیس: `docs/sql/11-wishes-schema.sql` — **روی Supabase واقعی اجرا شده** و با نقش‌های واقعی در تراکنش برگشت‌خورده تست شد (۱۳ بررسی: کارمند فقط پیش‌نویس خودش، نه برای همکار، نه خودتأییدی، تصمیم فقط Leitung/Inhaber، شرکت دیگر هیچ، تصمیم‌گرفته‌شده را کارمند نمی‌تواند پاک کند). ستون‌های جدید `wishes`: `status`، `submitted_at`، `decided_by`، `decided_at`، `decision_note`؛ توابع `submit_my_wishes(p_org)`، `decide_wish(p_id, p_status, p_note)`.

### صفحهٔ پروفایل
- صفحهٔ `/profil` (پوشهٔ `app/profil`) ساخته شد؛ لینک‌ها به `/profil` می‌روند. پوشهٔ قدیمی `app/profile` بی‌ضرر مانده است.
- اسکریپت SQL جدول `first_login_flags` و توابع `flag_first_login` / `clear_first_login` در دیتابیس هست ولی در `docs/sql` نیست → بعداً از دیتابیس به فایل منتقل شود.

### تست‌ها
تست‌های جدید در `dev-tests` (جدا از پروژه): `print_test`، `wake_test`، `opening_test`، `closed_emp_test`، `wishes_test`، `genbtn_test`، `saldo_test`، `late_test`، `opening_test` (نیم‌روز)، `admin_test`، `mid_ui_test`، `pending_test`، `sick_ui_test`، شبیه‌سازی `sick_test`، و شبیه‌سازی تولید پلن. `edit_test` و `approval_test` قدیمی هستند (مدل نقش قبلی «Zur Freigabe einreichen») و باید به‌روز شوند.

## ۱۱.۰ نقش‌ها و ادمین (برگشت به حالت قبل، تصمیم کاربر ۱۲.۱۰.)
- نام «Hauptkonto» امتحان شد و **برگردانده شد** → همه‌جا دوباره **«Inhaber»** (متن‌های برنامه و پیام‌های توابع دیتابیس؛ دسترسی‌ها و security definer بررسی شد).
- محدود کردن ادمین به فقط Inhaber هم **برگردانده شد**: `/admin` مثل قبل همهٔ حساب‌ها، «+ Konto hinzufügen» (Leitung/Schichtplaner/Mitarbeitende)، «E-Mail ändern»، «Neues Passwort»، «Entfernen». «Zugänge» در شرکت هم مثل قبل (فقط با محصول Mitarbeiter-App).
- «Rolle ändern»، «Stellvertretende Leitung»، تغییر ایمیل توسط خود کارمند: فعلاً نه.
- **ایده‌های فقط برای مشتری سفارش‌دهنده (پشت کلید ویژگی):** حالت چرخشی (مثلاً ۵× Nacht → ۲ frei → ۵× Früh → ۲ frei → ۵× Spät → ۲ frei)؛ **پلن هفتگی/سالانه** (کاربر: «هر وقت خواستیم، الان نه»): بازهٔ هفته به‌جای ماه، انتشار هفتگی، قوانین در مرز هفته‌ها؛ سالانه = ۱۲ ماه پشت‌سرهم.
- **محیط آزمایشی (فعلی):** شاخهٔ `test` در GitHub → Vercel Preview `https://lab-shift-app-git-test-mmeslami-2517.vercel.app` (همان دیتابیس! فقط شرکت‌های تست). متغیرهای محیطی Supabase برای Production و Preview فعال. روال: آپلود در `test` → امتحان → Pull request → Merge → چک Deployments؛ بار اول ورسل بعد از merge خودکار نساخت → «⋯ → Promote» روی Preview (علت هنوز بررسی نشده). پروژهٔ Supabase «transport-scanner» مال برنامهٔ پسر کاربر است — **دست نزن**. دیتابیس آزمایشی جدا بعد از Supabase Pro با `docs/sql/STAGING-SETUP.sql`.

## ۱۱.۱ Funktionen pro Firma (کلیدهای ویژگی، ساخته شد)
- فهرست کلیدها در `lib/features.js` (`FEATURES`، `hasFeature(org, key)`). جدول `org_features` (`docs/sql/19-org-features-schema.sql`، اجرا شد): اعضای شرکت فقط می‌خوانند، فقط سرور (ادمین) می‌نویسد. `/admin` → زیر محصولات هر شرکت «Funktionen nur für diese Firma» (روشن/خاموش، در `admin_log`). در `OrgContext` به‌صورت `org.features`؛ ترمینال از پاسخ `token`.
- **اولین کلید:** `terminal_pin_only` = دکمهٔ «Ohne Handy: mit PIN stempeln» روی ترمینال (جای ثابت `SHOW_PIN_ONLY`). تست: فقط برای همان شرکت دیده می‌شود.
- **روال برای هر خواستهٔ مخصوص مشتری:** کلید در `FEATURES` → در کد `hasFeature(...)` → اول برای Testfirma روشن و تست → بعد برای مشتری. منطق قبلی برای بقیه بدون تغییر.

## ۱۱.۰۱ «beste von 60 Varianten» + Saldo Labor در دیتابیس
- **هر دو Dienstplaner:** «Dienstplan erstellen/Neu generieren» حالا ۶۰ بار با **همان قوانین** پلن می‌سازد (تساوی‌ها تصادفی) و بهترین را نشان می‌دهد (`lib/planScore.js`): ۱) هشدار قانون (۱۰۰۰ هر کدام؛ «weniger als 2 Samstage/Sonntage» نرم ۲۰؛ «Abweichung vom Stundenziel» جدا با ۳ سنجیده می‌شود)، ۲) شیفت کم‌نفر/اضافه‌کاری ۱۵، ۳) **پخش برابر ساعت نسبت به Ziel** (انحراف معیار × ۵۰۰۰)، ۴) ساعت بالای Ziel، ۵) پخش شب نسبت به ساعت قرارداد، ۶) پخش آخر هفته، ۷) جفت شنبه/یکشنبه. پیام: «Neu erstellt um … · beste von 60 Varianten». ~۳ میلی‌ثانیه هر پلن.
- شبیه‌سازی نوامبر با ۶ تمام‌وقت + ۱ پاره‌وقت + ۴ مینی (کمبود ساختاری ~۱۵۰ ساعت): فاصلهٔ بیشترین تا کمترین کمبود تمام‌وقت‌ها از ~۲۵ به ~۱۵ ساعت؛ هشدار قانون سخت ۰٫۵ → ۰؛ جفت آخر هفته ۰. (کمبود کلی ساعت حل نمی‌شود: شیفت کافی نیست؛ راه: نفر بیشتر برای شیفت یا گزینهٔ «Bis zum Ziel auffüllen» – ساخته نشده.)
- **Labor: Saldo در دیتابیس** (مثل allgemein، جدول `staff_month_balance`): «Monat abschließen» ردیف‌ها را ذخیره می‌کند، ماه بعد «Saldo aus Vormonaten» از دیتابیس (هر مرورگر/دستگاه، از جمله آدرس آزمایشی). منطق Labor (Ziel ۱۶۰، Saldo فقط روی اولویت) **بدون تغییر**. «Alle Salden löschen» با ورود شرکت پنهان. تست: `saldo_lab_test`.
- **«Befreit von Büro»** (Labor، تصمیم کاربر: الف): تیک برای هر نفر کنار «Befreit von Nachtdienst/Wochenendquote»؛ ستون `staff.no_office` (`docs/sql/22-kein-buero-schema.sql`، اجرا شد)؛ مولد هرگز شیفت Büro (کلید B یا نام «Büro») به آن نفر نمی‌دهد (تغییر دستی ممکن). تست: ۲۷۰ شیفت Büro در ۳۰ پلن، صفر برای افراد معاف.

## ۱۱.۰۲ جدول پلن در کادر جداگانه (هر دو Dienstplaner)
- جدول «nach Tag» و «nach Mitarbeitenden» حالا در کادر خودش اسکرول می‌شود (کلاس `plan-scroll` در `globals.css`: حداکثر ۷۲٪ ارتفاع صفحه)، سرستون‌ها هنگام اسکرول بالا می‌مانند؛ دکمه‌های بالای جدول (Krankmeldung، Rückgängig، Drucken …) همیشه همان‌جا در دسترس. در چاپ مرورگر محدودیت ارتفاع برداشته می‌شود. تست: `planscroll_test`.

## ۱۱.۰۳ Abwesenheit (ساخته شد)
- Leitung/Inhaber در «Anwesenheit»: کنار هر نفر در «Noch nicht eingestempelt» دکمهٔ «Abwesend …»؛ در «Zeiten bearbeiten» برای هر روز «Abwesenheit eintragen …» / «Ändern» / «Aufheben» (با Grund). انواع (`lib/absence.js`): Krank، Urlaub، Fortbildung/Dienstreise، Sonstiges (bezahlt) = ساعت برنامه‌ریزی‌شده **بدون کسر** حساب می‌شود؛ Überstundenabbau و Unentschuldigt = ساعت شیفت از Zeitkonto **کم** می‌شود («Unentschuldigt (−8:00 h)»). بعد از «Krank» راهنما به «Krankmeldung / Ausfall» برای جایگزین. (قواعد حقوقی با مشاور حقوق کار تأیید شود.)
- **درخواست‌های تأییدشده** (Urlaub/Fortbildung/Krankmeldung در Anträge) خودکار همان اثر را دارند: بدون هشدار، بدون pop-up، در اپ برچسب نوع.
- اپ کارمند: برچسب نوع به‌جای «Kommen fehlt»، در جزئیات روز «(eingetragen von der Leitung)» / «(genehmigter Antrag)». همکاران نمی‌بینند.
- دیتابیس: `docs/sql/21-abwesenheit-schema.sql` (اجرا و با نقش‌های واقعی تست شد، ۷ بررسی): جدول `attendance_absences` (هر نفر/روز یک فعال؛ تغییر = قدیمی «ersetzt» باطل؛ هیچ حذف)، `set_absence`، `void_absence` (Grund اجباری).
- **Zeitkonto حالا از روز روشن‌شدن Zeiterfassung برای شرکت** (`org_products.created_at`) شمرده می‌شود (قبلاً از اولین ثبت خود شخص).
- تست: `abwesend_test`.

## ۱۱.۰۴ خوش‌آمدگویی در صفحهٔ ورود
- `components/LoginForm.jsx` (همهٔ صفحه‌های ورود): «Guten Morgen/Tag/Abend» (بر اساس ساعت دستگاه) + «Herzlich willkommen!» (بدون دست و جملهٔ دوم، تصمیم کاربر)

## ۱۱.۰۵ Zeiterfassung مرحلهٔ ۲: Korrekturen (ساخته شد)
- **کارمند** (`EmployeeTimes.jsx`): در فهرست «Gehen fehlt – bitte Korrektur beantragen» (جلسهٔ باز بیش از ۱۲ ساعت)؛ در جزئیات روز «Korrektur beantragen» (Kommen/Gehen ساعت + Grund؛ برای روز بدون ثبت «Vergessen zu stempeln? Zeit beantragen» با هر دو زمان؛ Gehen قبل از Kommen = صبح روز بعد/شیفت شب). وضعیت: Offen / Übernommen ✓ / Abgelehnt + «Antwort der Leitung». زمان‌های اصلاح‌شده با «✎». ماه بسته: فقط هشدار.
- **Leitung/Inhaber** (`AttendanceDialog.jsx`): دکمهٔ «Anwesenheit (n)» نارنجی وقتی درخواست باز هست؛ کادر «Korrekturanträge» با «Übernehmen» / «Ablehnen» (+Grund)؛ «Gehen fehlt» در جدول امروز؛ بخش «Zeiten bearbeiten (auch frühere Tage)»: Person + Tag → «Korrigieren» (فقط فیلد اشتباه، Grund اجباری) و «+ Zeit nachtragen». ماه بسته (`staff_month_balance`) → تأیید اضافه.
- **دیتابیس** `docs/sql/20-zeit-korrekturen-schema.sql` (اجرا و با نقش‌های واقعی تست شد، ۹ بررسی): جدول `attendance_correction_requests` (RLS: کارمند فقط برای خودش و فقط open، پس‌گرفتن open؛ Leitung می‌بیند)، `decide_correction_request` (اعمال از طریق `correct_attendance` یا `add_attendance_session`، هر دو با ثبت در `attendance_corrections`)، `add_attendance_session` (حداکثر ۱۶ ساعت، Grund اجباری). ثبت‌های اصلی (`attendance_events`) هرگز عوض نمی‌شوند.
- **«Kommen fehlt» (تصمیم کاربر: کارمند ۳۰ دقیقه، Leitung ۳ ساعت):** در اپ، روز با شیفت منتشرشده و بدون هیچ ثبت → امروز ۳۰ دقیقه بعد از شروع شیفت «Kommen fehlt»، روزهای قبل «Kommen fehlt – bitte Korrektur beantragen» (فقط از روز روشن‌شدن Zeiterfassung = `org_products.created_at`). Leitung در «Anwesenheit»: «Noch nicht eingestempelt (n)» = شیفت‌هایی که ۳ تا ۲۰ ساعت پیش شروع شده‌اند بدون Kommen. **Pop-up در اپ کارمند** (`components/StampReminder.jsx`): «Kommen vergessen?» (۳۰ دقیقه بعد از شروع شیفت بدون ثبت) / «Gehen vergessen?» (ثبت باز > ۱۲ ساعت)، هر شیفت یک بار، دکمهٔ «Zu meinen Zeiten». فقط وقتی اپ باز است؛ **اعلان واقعی گوشی (Web Push، وقتی اپ بسته است)** = کار باز جدا (iPhone فقط با اپ نصب‌شده روی صفحهٔ اصلی و iOS ≥ 16.4، اجازهٔ کاربر، زمان‌بند سرور). مرخصی/بیماری شیفت ندارند → هشدار نمی‌گیرند.
- تست: `korrektur_test`، `kommenfehlt_test` (مرورگر).

## ۱۱.۲ Anträge و Zugänge (ساخته شد، هر دو Dienstplaner)
- **Anträge در اپ کارمند** (`components/EmployeeRequests.jsx`، تب «Anträge» دیگر خالی نیست): «+ Neuer Antrag» با نوع (از `request_types`: Urlaub/Fortbildung/Krankmeldung)، از/تا، شمار روزهای کاری دوشنبه–جمعه، یادداشت → «An die Leitung senden». وضعیت: «Offen – wartet auf die Leitung» / «Genehmigt ✓» / «Abgelehnt» + «Antwort der Leitung». درخواست باز قابل «Zurückziehen».
- **Leitung** (`components/RequestsDialog.jsx`): دکمهٔ «Anträge (n)» در OrgBar (قرمز وقتی باز هست؛ هر دقیقه چک)، فیلتر Offen/Genehmigt/Abgelehnt/Alle، «Genehmigen» / «Ablehnen» (دلیل اختیاری که شخص می‌بیند) / «Wieder öffnen»؛ «Genehmigte in den Plan übernehmen» → Urlaub (U) / Krankmeldung (A) همان ماه در فهرست‌های Urlaub/Krank برنامه‌ریز (بدون تکرار، فقط با «Neu generieren» اثر). Schichtplaner فقط می‌بیند.
- دیتابیس: `docs/sql/18-antraege-schema.sql` (ستون `decision_note`، حد ۵۰۰ حرف) — اجرا شد؛ RLS موجود با نقش‌های واقعی تست شد (۸ بررسی).
- **Zugänge** (`components/ZugaengeDialog.jsx` + `app/api/zugang/route.js`): مثل صفحهٔ ادمین ولی فقط برای شرکت خود. **Inhaber** → Leitung، Schichtplaner، Mitarbeitende؛ **Leitung** → Schichtplaner، Mitarbeitende (Leitung نمی‌تواند Leitung دیگر بسازد/ریست/حذف کند؛ تصمیم امنیتی). بخش «Leitung & Schichtplaner» (اختیاری: «Arbeitet selbst im Plan?» → اتصال به یک Person). کارمندان: «+ Zugang anlegen» (ایمیل) → رمز موقت ۱۶ حرفی **یک بار** نمایش + «Kopieren»، ورود اول رمز خود؛ «Neues Passwort»؛ «Entfernen» (فقط عضویت، داده‌ها می‌مانند). هرگز Inhaber/Leitung/ادمین پلتفرم/شرکت دیگر. همه در `admin_log` با پیشوند `leitung_`. تست: `zugang_test` (۱۲ بررسی) + `antraege_test` (مرورگر).

## ۱۱.۳ Zeiterfassung – مرحلهٔ ۱ (ساخته شد)
- محصول جدید `time_tracking` («Zeiterfassung») در `/admin` برای هر شرکت.
- **Terminal** `/terminal` (`components/TerminalView.jsx`): **هیچ‌کس روی تبلت وارد نمی‌شود** (تصمیم کاربر: تبلت جدا از برنامهٔ مالک، هیچ رمزی در مرورگر تبلت ذخیره نشود). Leitung در «Anwesenheit → + Neues Terminal einrichten» یک **کد یک‌بارمصرف** `XXXX-XXXX` (۲۴ ساعت، فقط هش در `terminal_pair_codes`) می‌سازد — از هر کامپیوتر/گوشی، حتی تلفنی قابل اعلام؛ روی تبلت فقط همین کد وارد می‌شود → سریال و کلید دستگاه در localStorage `zeit-terminal`. باز کردن دوبارهٔ `/terminal` در همان مرورگر خودکار ادامه می‌دهد. لینک «Terminal zurücksetzen» برداشته شد (تا کسی تصادفاً قفلش نکند). پیشنهاد: حالت کیوسک تبلت (Android «App anpinnen» / iPad «Geführter Zugriff»). نمایش ساعت سرور، QR که هر ۲۵ ثانیه عوض می‌شود (توکن ۶۰ ثانیه، `terminal_tokens`)، QR بدون کتابخانه (`lib/qr.js`، با OpenCV تست شد). «Ohne Handy: mit PIN stempeln»: انتخاب نام → PIN → Kommen/Gehen؛ ۵ PIN غلط = ۱۵ دقیقه قفل (`pin_failures`). صفحه روشن می‌ماند (Wake Lock). «Terminal zurücksetzen».
- **Stempeln** `/stempeln?t=…` (`components/StempelnView.jsx`): **ترتیب (تصمیم کاربر):** اول Kommen/Gehen روی تبلت (۲۰ ثانیه) → QR فقط بعد از انتخاب ظاهر می‌شود و جهت را در خودش دارد (`terminal_tokens.direction`) → اسکن با دوربین معمولی → گوشی **بدون دکمه** فوراً ثبت می‌کند و تأییدیهٔ سبز «Eingestempelt» / قرمز «Ausgestempelt» نشان می‌دهد. QR قدیمی بدون جهت → دو دکمه. دوبار در ۶۰ ثانیه → پیام زرد «schon eingestempelt».
- **API** `app/api/zeit/route.js`: actions `register` (کاربر)، `token`/`staff`/`pin` (دستگاه)، `qr` (کاربر). شرکت همیشه از دستگاه/توکن.
- **Zeiten در اپ کارمند** (`components/EmployeeTimes.jsx`، طبق عکس‌های Planerio ولی طراحی خودمان): «Dein Zeitkonto» بزرگ، ماه با «🔒 Monat abgeschlossen» و Monatssaldo، فهرست روزها (Heute/Gestern/…، نوار رنگ شیفت، «gearbeitet 8:07 h»/«läuft seit …»/«geplant, kein Stempel»)، جزئیات روز: Kommen/Gehen با 🔒، Anwesenheit − Pause (قانونی خودکار: >۶ ساعت ۳۰ دقیقه، >۹ ساعت ۴۵ دقیقه) = Gearbeitet − Geplant (شیفت منتشرشده منهای ۳۰ دقیقه) = Tagessaldo، و Zeitkonto vorher/neu. Zeitkonto = ماه‌های بسته (planned−contract) + هر روزِ تمام‌شده از اولین Stempel (worked−planned). تنظیم «Stempel-PIN» در همین صفحه.
- **Leitung**: دکمهٔ «Anwesenheit» در OrgBar (فقط با محصول): «Jetzt da»، جدول امروز (Kommen/Gehen/Dauer، «PIN zurücksetzen»)، ترمینال‌ها با «Sperren/Entsperren». هر ۳۰ ثانیه تازه می‌شود.
- **دیتابیس** `docs/sql/16-zeiterfassung-schema.sql` (روی Supabase واقعی اجرا و تست شد، ۸ بررسی): `staff_pins` (فقط هش bcrypt، برای هیچ کاربری حتی Leitung قابل خواندن نیست)، `terminal_tokens`، `pin_failures`، توابع `set_my_pin`/`my_pin_is_set`/`reset_staff_pin`/`check_staff_pin` (فقط سرور)، trigger `attendance_apply_event` (in → Session باز، out → بستن؛ بدون direction = تغییر وضعیت؛ هیچ حذف).
- تست: `zeit_route_test` (۱۸ بررسی امنیت)، `zeit_e2e_test` (جریان کامل در مرورگر).
- **Chipkarte (ساخته شد):** کارت‌خوان USB با «شبیه‌سازی صفحه‌کلید» (عدد کارت + Enter) به تبلت/لپ‌تاپ ترمینال؛ ترمینال ورودی سریع صفحه‌کلید را کارت تشخیص می‌دهد. **ترتیب (تصمیم کاربر):** اول «→ Kommen» (کادر سبز) یا «← Gehen» (کادر قرمز) را بزند (۱۰ ثانیه فعال) → بعد کارت/چیپ → فوراً ثبت. اگر کارت اول آمد: «Bitte wählen» با همان دو دکمه (بدون ثبت خودکار). همین رنگ‌ها در صفحهٔ PIN و صفحهٔ گوشی (`/stempeln`). بدون فلش‌ها؛ متن «Karte oder Chip an das Kartenlesegerät halten»؛ کادر سفید نام شرکت بالای ترمینال (از پاسخ `token`). داخل دکمه‌ها فقط «Kommen»/«Gehen»؛ با کلیک کمی کوچک می‌شوند و دکمهٔ انتخاب‌شده یک «پرش» کوتاه دارد (کلاس `tbtn`). «Oder mit dem Handy scannen» بالای QR. «Ohne Handy: mit PIN stempeln» فعلاً پنهان (`SHOW_PIN_ONLY = false` در `TerminalView.jsx`). جعبهٔ «Stempel-PIN» در اپ فقط وقتی شرکت «Karte + PIN» را روشن کرده باشد. تنظیم هر شرکت «Karte + PIN erforderlich» (پیش‌فرض خاموش = کارت تنها؛ تصمیم کاربر). Leitung در «Anwesenheit → Chipkarten»: «+ Karte zuweisen» (کارت را جلوی کارت‌خوان همان کامپیوتر بگیرد) و «Entziehen». جدول `badges` (یک کارت فعال فقط برای یک نفر در هر شرکت)، `organizations.card_requires_pin`، `set_card_requires_pin` — `docs/sql/17-chipkarten-schema.sql` (روی Supabase واقعی اجرا شد). تست: `zeit_card_test` + بخش کارت در `zeit_e2e_test`.
- **مرحلهٔ ۲ (باز):** «Korrektur beantragen» در اپ + تأیید Leitung با `correct_attendance`، هشدارهای ArbZG، گزارش ماهانه PDF/Excel، حساب Saldo با ساعت واقعی برای ماه‌بستن.

## ۱۱.۴ «↶ Rückgängig» و «Alle Änderungen verwerfen» (هر دو Dienstplaner)
- کنار «Drucken / PDF»: «↶ Rückgängig» (بدون عدد، طبق خواست کاربر) آخرین تغییر را برمی‌گرداند (هر خانهٔ دستی، «Neu generieren»، و در Labor هر «Übernehmen» در Krankmeldung همراه با ثبت بیماری)؛ تا ۴۰ قدم؛ میان‌بر Strg+Z (نه داخل فیلدهای متن). «Alle Änderungen verwerfen» (با تأیید) پلن را به نسخهٔ منتشرشدهٔ همان ماه برمی‌گرداند و خودش هم با «Rückgängig» برگشت‌پذیر است؛ بدون نسخهٔ منتشرشده یا بدون تغییر غیرفعال. فقط روی صفحه، قبل از انتشار؛ «Plan laden» تاریخچه را پاک می‌کند. تست: `undo_test` (هر دو Planer) و `sick_ui_test`.

## ۱۱.۵ ممیزی امنیت و حقوقی (۱۰ اکتبر ۲۰۲۶)
- **منطقه:** Supabase `eu-central-1` (Frankfurt) — بررسی با Connector؛ مهاجرت لازم نبود. توابع سرور Vercel با `vercel.json` → `"regions": ["fra1"]` (پیش‌فرض Vercel آمریکا `iad1` بود).
- **رمزها:** همهٔ ۱۰ حساب bcrypt (`$2a$`). توکن ورود: supabase-js در **localStorage** (نه کوکی httpOnly). تغییر به کوکی httpOnly = بازنویسی بزرگ (`@supabase/ssr` + middleware برای همهٔ صفحه‌ها) → کار باز. به‌جایش اکنون: هدرهای امنیتی در `next.config.js` (CSP بدون اسکریپت خارجی، `connect-src` فقط خود سایت و `*.supabase.co`، `frame-ancestors 'none'`، HSTS، nosniff، Referrer-Policy، Permissions-Policy با دوربین فقط برای خود سایت).
- **جدایی شرکت‌ها:** RLS روی **همهٔ** جدول‌ها؛ تست خودکار روی هر جدول دارای `org_id` با نقش‌های واقعی (B چیزی از A نمی‌بیند و برعکس) → سالم. «Middleware» در Next.js جای RLS را نمی‌گیرد (RLS در خود دیتابیس برای هر query اجباری است). سخت‌سازی: `anon` هیچ حق جدولی ندارد؛ `authenticated` بدون TRUNCATE/TRIGGER/REFERENCES. `search_path` برای ۶ تابع ثابت شد. دو view با SECURITY DEFINER (`my_shift_changes`, `team_directory`) عمدی و با فیلتر کاربر/شرکت.
- **Zeiterfassung ضددستکاری:** زمان هر ثبت = **زمان سرور (UTC)** (هم در `/api/attendance` و هم trigger دیتابیس)؛ زمان دستگاه فقط در `raw_payload.device_scanned_at`. `attendance_events` و `attendance_corrections` **غیرقابل تغییر/حذف** (حتی برای service_role). `attendance_sessions` فقط از طریق `correct_attendance(session, field, new, reason)` (فقط Leitung/Inhaber، دلیل اجباری، قدیم/جدید/چه کسی در لاگ). تست: ۱۱ بررسی با نقش‌های واقعی، برگشت‌خورده. اسکریپت: `docs/sql/15-security-hardening.sql` (اجرا شده).
- **حقوقی:** صفحه‌های `/impressum` و `/datenschutz` (الگو با جاهای خالی زرد برای آدرس لوبک؛ باید توسط مشاور بررسی شود)، لینک در پاورقی همهٔ صفحه‌ها (`components/SiteFooter.jsx`). Datenschutz صادقانه: پایگاه داده Frankfurt؛ Supabase و Vercel شرکت‌های آمریکایی‌اند → جملهٔ «هیچ انتقالی به خارج اتحادیه نیست» **نوشته نشد** چون درست نیست (SCC/DPF).
- **SEO/دامنه:** متادیتای آلمانی در `app/layout.js` (عنوان فعلاً کوتاه «Dienstplaner»؛ عنوان تبلیغاتی پیشنهادی هوش مصنوعی دیگر «… für Gastronomie und KMU | Serverstandort Frankfurt» عمداً **برگردانده شد** تا با نام محصول، دامنه و صفحهٔ معرفی عمومی بیاید)، `app/robots.js`، `app/sitemap.js`؛ آدرس از متغیر `NEXT_PUBLIC_SITE_URL` (بعد از خرید دامنه در Vercel تنظیم شود؛ در Supabase → Authentication → URL Configuration هم آدرس جدید).
- **ارزیابی:** این فهرست از یک هوش مصنوعی دیگر بود. لازم/مفید: ۴ (Zeiterfassung)، ۵ (صفحه‌های قانونی، بدون جملهٔ نادرست)، منطقهٔ Vercel، سخت‌سازی دیتابیس، هدرها. لازم نبود: bcrypt (از قبل)، Middleware (RLS قوی‌تر است). عقب‌افتاده: کوکی httpOnly.
- **پیشنهادهای advisor باقی‌مانده:** «Leaked Password Protection» در Supabase Auth روشن شود (ممکن است پلن Pro بخواهد).

## ۱۲. کارهای باز (به‌روز)
1. دکمهٔ «Zugänge» برای Leitung: ساخت ورود کارمند و رمز جدید بدون ادمین (در یک چت قبلی ساخته و تست شده بود، روی نسخهٔ جدید منتقل نشده).
2. صندوق پیام / اعلان برای کارمند.
3. Anträge (مرخصی) در اپ کارمند ↔ صفحهٔ Leitung (Wünsche ساخته شد).
4. ورود و خروج (تبلت/QR + PIN، اصلاح با دلیل).
5. ذخیرهٔ خودکار پلنِ ذخیره‌نشده در مرورگر (برای بسته شدن واقعی زبانه).
6. Supabase Pro، Vercel Pro، دامنه، حقوقی.
