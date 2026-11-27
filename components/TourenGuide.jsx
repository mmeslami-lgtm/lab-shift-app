"use client";
// Touren / Dispatcher – step-by-step guide (27.11.2026, English only on request).
// Screenshots: public/guide/*.webp (numbered red markers = the numbers in the steps).
import React from "react";

const CSS = `
.tg{--ink:#1B2433;--muted:#5B6678;--line:#DCE2EC;--primary:#243B6B;--red:#E11D48;--paper:#F4F6FA;
  font:16px/1.6 Inter,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);background:var(--paper);min-height:100vh}
.tg *{box-sizing:border-box}
.tg-bar{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.95);backdrop-filter:blur(6px);border-bottom:1px solid var(--line)}
.tg-bar-in{max-width:980px;margin:0 auto;padding:10px 18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.tg-logo{display:flex;align-items:center;gap:9px;font-weight:700;color:var(--ink);text-decoration:none}
.tg-mark{width:30px;height:30px;border-radius:9px;background:var(--primary);display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:15px}
.tg-bar nav{display:flex;gap:4px;flex-wrap:wrap;margin-left:auto}
.tg-bar nav a{font-size:14px;color:var(--muted);text-decoration:none;padding:6px 10px;border-radius:8px}
.tg-bar nav a:hover{background:#EEF2F8;color:var(--ink)}
.tg-btn{border:0;border-radius:10px;background:var(--primary);color:#fff;font:600 14px/1 inherit;padding:10px 14px;cursor:pointer;text-decoration:none;display:inline-flex;gap:6px;align-items:center}
.tg-btn.light{background:#fff;color:var(--ink);border:1.5px solid #B9C5DA}
.tg-wrap{max-width:980px;margin:0 auto;padding:28px 18px 60px}
.tg-hero{background:#fff;border:1px solid var(--line);border-radius:20px;padding:28px;margin-bottom:26px}
.tg-hero h1{font-size:30px;line-height:1.2;margin:0 0 8px;font-weight:750;letter-spacing:-.01em}
.tg-hero p{margin:0;color:var(--muted)}
.tg-road{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:20px}
.tg-road a{display:block;border:1px solid var(--line);border-radius:14px;padding:14px;text-decoration:none;color:var(--ink);background:#FAFBFD}
.tg-road a b{display:block;font-size:13px;color:var(--primary);letter-spacing:.04em;text-transform:uppercase}
.tg-road a span{font-weight:650}
.tg-road a:hover{border-color:#9AAED0}
.tg-note{background:#EEF4FF;border:1px solid #CFDDF6;border-radius:12px;padding:12px 14px;font-size:14.5px;margin:14px 0}
.tg-warn{background:#FFF7E6;border-color:#F3D9A4}
.tg-ch{margin-top:40px}
.tg-ch>h2{font-size:24px;font-weight:750;margin:0 0 4px;display:flex;align-items:center;gap:12px}
.tg-ch>h2 .n{width:38px;height:38px;border-radius:12px;background:var(--primary);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.tg-ch>p.lead{color:var(--muted);margin:0 0 16px 50px}
.tg-step{background:#fff;border:1px solid var(--line);border-radius:18px;padding:20px 22px;margin:14px 0;break-inside:avoid;page-break-inside:avoid}
.tg-step h3{font-size:18px;font-weight:700;margin:0 0 8px}
.tg-step h3 small{color:var(--muted);font-weight:500;font-size:14px;margin-left:6px}
.tg-step p{margin:0 0 6px}
.tg-step ol{margin:8px 0 0;padding:0;list-style:none;counter-reset:m}
.tg-step ol>li{position:relative;padding-left:36px;margin:7px 0}
.tg-step ol>li::before{counter-increment:m;content:counter(m);position:absolute;left:0;top:1px;width:24px;height:24px;border-radius:50%;background:var(--red);color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center}
.tg-step ul{margin:6px 0 0;padding-left:20px;list-style:disc}
.tg-step ul li{margin:4px 0}
.tg-shot{margin:14px 0 4px;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#F7F9FC}
.tg-shot img{display:block;width:100%;height:auto}
.tg-shot.narrow{max-width:420px}
.tg-shot.mid{max-width:640px}
.tg-path{display:inline-block;background:#F1F4F9;border:1px solid var(--line);border-radius:8px;padding:1px 8px;font-size:14px;font-weight:600;white-space:nowrap}
.tg-check{background:#fff;border:1px solid var(--line);border-radius:18px;padding:20px 22px;margin-top:40px}
.tg-check h2{margin:0 0 8px;font-size:22px;font-weight:750}
.tg-check li{margin:6px 0}
.tg-foot{margin-top:30px;color:var(--muted);font-size:13px;text-align:center}
@media (max-width:640px){.tg-hero{padding:20px}.tg-hero h1{font-size:24px}.tg-ch>p.lead{margin-left:0}.tg-step{padding:16px}}
@media print{
  .tg{background:#fff;font-size:11pt}
  .tg-bar,.tg-noprint{display:none!important}
  .tg-wrap{padding:0;max-width:none}
  .tg-hero,.tg-step,.tg-check{border-color:#cbd5e1}
  .tg-ch{break-before:page;margin-top:0}
  .tg-step{break-inside:auto;page-break-inside:auto;padding:12px 16px;margin:8px 0}
  .tg-shot{break-inside:avoid;page-break-inside:avoid;margin:8px 0;border:0;background:none;text-align:center}
  .tg-shot img{max-height:95mm;width:auto;max-width:100%;margin:0 auto;border:1px solid #dbe2ec;border-radius:8px}
  .tg-step h3{break-after:avoid}
  .tg-hero{padding:16px 18px}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @page{size:A4;margin:14mm 14mm 16mm;@bottom-center{content:"Dienstigo · Dispatcher guide · page " counter(page);font:8pt Arial,sans-serif;color:#64748b}}
}`;

const P = ({ children }) => <span className="tg-path">{children}</span>;
const Shot = ({ src, alt, size }) => (
  <figure className={`tg-shot${size ? " " + size : ""}`}><img src={`/guide/${src}.webp`} alt={alt} loading="lazy" /></figure>
);
const Step = ({ id, title, sub, children }) => (
  <section className="tg-step" id={id}><h3>{title}{sub ? <small>{sub}</small> : null}</h3>{children}</section>
);

export default function TourenGuide() {
  return (
    <div className="tg">
      <style>{CSS}</style>
      <header className="tg-bar">
        <div className="tg-bar-in">
          <a href="/touren" className="tg-logo"><span className="tg-mark" aria-hidden="true">◎</span>Dienstigo · Guide</a>
          <nav aria-label="Chapters">
            <a href="#settings">1 · Company settings</a>
            <a href="#staff">2 · Staff</a>
            <a href="#customers">3 · Customers</a>
            <a href="#daily">4 · Daily work</a>
          </nav>
          <button type="button" className="tg-btn" onClick={() => window.print()}>🖨 Print / PDF</button>
          <a href="/touren" className="tg-btn light">← Back to the app</a>
        </div>
      </header>

      <main className="tg-wrap">
        <div className="tg-hero">
          <h1>Dispatcher guide: getting started</h1>
          <p>Set up your company in three steps: first the company settings, then your staff, then your customers. After that you can create the first job and assign staff. Chapter 4 shows the daily work: checking staff while you talk to a customer, and what to do when someone is sick. Each step shows a real screen; the <b style={{ color: "#E11D48" }}>red numbers</b> in the picture match the numbers in the text.</p>
          <div className="tg-road">
            <a href="#settings"><b>Chapter 1</b><span>Company settings</span><br /><small>Logo, places, skills, services</small></a>
            <a href="#staff"><b>Chapter 2</b><span>Staff</span><br /><small>People, starting point, app access</small></a>
            <a href="#customers"><b>Chapter 3</b><span>Customers</span><br /><small>Addresses, first job</small></a>
            <a href="#daily"><b>Chapter 4</b><span>Daily work</span><br /><small>Free staff, sick staff, moving jobs</small></a>
          </div>
          <div className="tg-note"><b>Who can do what?</b> The <b>owner</b> and <b>managers</b> can do everything in this guide. The <b>office</b> can work with customers and jobs, but not with settings, staff or access. Staff only use the staff app on their phone.</div>
        </div>

        {/* ---------------- Chapter 1 ---------------- */}
        <div className="tg-ch" id="settings">
          <h2><span className="n">1</span>Company settings</h2>
          <p className="lead">Do this once. Everything later (staff, customers, jobs) uses these settings.</p>

          <Step id="s1-1" title="1.1 Company details & logo" sub="optional">
            <p>Open <P>Profile & Password</P> at the top of the screen. In the card of your company you find <b>Company details & logo</b>. Press <b>Edit</b>.</p>
            <Shot src="1b-profile-edit" alt="Company details and logo" size="mid" />
            <ol>
              <li><b>Upload logo</b> – choose a PNG or JPG. It is resized automatically. (When a logo is saved, the button is called <i>Other logo</i>; <i>Remove logo</i> deletes it.)</li>
              <li>Enter the <b>company address</b>, <b>phone</b>, <b>email</b> and <b>website</b>. All fields are optional.</li>
              <li>Press <b>Save</b>.</li>
            </ol>
            <div className="tg-note">The logo and these details appear at the top and bottom of the printed consent form, job plan and transport sheet.</div>
          </Step>

          <Step id="s1-2" title="1.2 Open the settings">
            <p>In the menu on the left, press <P>Settings</P>. On the phone: <P>More</P> → <P>Settings</P>.</p>
            <Shot src="1c-nav-settings" alt="Settings in the menu" size="narrow" />
          </Step>

          <Step id="s1-3" title="1.3 Company working hours">
            <p>When your company takes jobs. “Staff available?” and “Find earliest appointment” in the job window only suggest times within these hours.</p>
            <Shot src="1c2-hours" alt="Company working hours" />
            <ol>
              <li><b>From</b> – start of the working day.</li>
              <li><b>To</b> – end of the working day. A job must end by then.</li>
              <li><b>Working days</b> – tap the days (dark = working day).</li>
              <li>Press <b>Save</b>.</li>
            </ol>
          </Step>

          <Step id="s1-4" title="1.4 Rules for suggestions">
            <p>When you assign staff to a job, Dienstigo suggests the best people. These three numbers control the suggestions.</p>
            <Shot src="1d-rules" alt="Rules for suggestions" />
            <ol>
              <li><b>“Nearby” up to (km)</b> – people within this distance count as close to the job.</li>
              <li><b>Fairness brake</b> – a close person is not suggested first if they have already worked this many percentage points more than the others this month.</li>
              <li><b>Travel time between two jobs</b> – if there is less time between two jobs, you see the hint “tight”.</li>
              <li>Press <b>Save</b>. If you are unsure, keep the default values.</li>
            </ol>
          </Step>

          <Step id="s1-5" title="1.5 Company places (company accommodation, office, warehouse)">
            <p>From here the way to the first job of the day is calculated, and the driver picks people up here. Press <b>+ Location</b>.</p>
            <Shot src="1e-places" alt="Company places" />
            <ol>
              <li><b>Name</b> – e.g. “Staff house Al Barsha”.</li>
              <li><b>Type</b> – <i>Company accommodation</i>, <i>Office</i>, <i>Warehouse</i> or <i>Other</i>. Staff who live in a company accommodation are later linked to it.</li>
              <li><b>Address</b> – after typing you should see “✓ Found on the map”. If not, paste a Google Maps link (<b>Paste link</b>) or press <b>My location here</b> when you are on site.</li>
              <li>Press <b>Save</b>. Repeat for every accommodation or office.</li>
            </ol>
          </Step>

          <Step id="s1-6" title="1.6 Skills / qualifications" sub="optional">
            <p>For example driving licence, glass cleaning or registered nurse. Later you tick them for each staff member.</p>
            <Shot src="1f-skills" alt="Skills" />
            <ol>
              <li>Type the name of the skill.</li>
              <li>Press <b>+ Skill</b>.</li>
            </ol>
          </Step>

          <Step id="s1-7" title="1.7 Services">
            <p>The list you choose from when you create a job – e.g. deep cleaning, window cleaning, maintenance.</p>
            <Shot src="1g-services" alt="Services" />
            <ol>
              <li>Under each service, tap the skills that are <b>required</b> (dark = required). Then only people with that skill are suggested.</li>
              <li>Type the name of a new service.</li>
              <li>Press <b>+ Service</b>. With the arrows ↑ ↓ you change the order in the list.</li>
            </ol>
            <div className="tg-note">A service that is already used in jobs cannot be deleted – use <b>set inactive</b> instead.</div>
          </Step>

          <Step id="s1-8" title="1.8 Custom fields" sub="optional">
            <p>Your own extra details for customers or jobs, e.g. “Pet”, “Gate code” or “Floor”.</p>
            <Shot src="1h-fields" alt="Custom fields" />
            <ol>
              <li><b>For</b> – customers or jobs. Choose the <b>Type</b> next to it (text, number, yes/no, list …).</li>
              <li>Type the <b>field name</b>. Tick <i>Required</i> or <i>Visible to staff</i> if needed.</li>
              <li>Press <b>Create field</b>.</li>
            </ol>
          </Step>
        </div>

        {/* ---------------- Chapter 2 ---------------- */}
        <div className="tg-ch" id="staff">
          <h2><span className="n">2</span>Staff</h2>
          <p className="lead">The people who work at your customers’. It is the same list as in the shift planner and time tracking.</p>

          <Step id="s2-1" title="2.1 Add a staff member">
            <p>In the menu press <P>Staff</P>, then <b>+ Staff member</b>.</p>
            <Shot src="2a-staff-list" alt="Staff list" />
            <div className="tg-note">A yellow <b>⚠ Consent missing</b> next to a name means: this person has a private home address saved, but no signed consent yet (see 2.4).</div>
          </Step>

          <Step id="s2-2" title="2.2 Basic details">
            <Shot src="2b-staff-form" alt="New staff member" />
            <ol>
              <li><b>Name</b> – required. Use first and last name so people can be told apart.</li>
              <li><b>Mobile / WhatsApp</b> – with country code. The person can later sign in to the app with this number.</li>
              <li><b>Staff no.</b> – optional, must be unique in your company.</li>
              <li><b>Contract hours per week</b> – used for fair distribution: whoever has worked less compared to their hours is suggested first.</li>
            </ol>
          </Step>

          <Step id="s2-3" title="2.3 Starting point and skills">
            <Shot src="2c-staff-start" alt="Starting point and skills" />
            <ol>
              <li><b>Starting point</b> – where the person starts the day:
                <ul>
                  <li><b>Company accommodation</b> – choose one of the places from 1.5. No consent needed.</li>
                  <li><b>Private house (own address)</b> – the person’s own home. Needs signed consent (2.4).</li>
                  <li><b>– none –</b> – the person comes on their own; no transport service.</li>
                </ul>
              </li>
              <li><b>Skills</b> – tap all skills the person has (dark = yes).</li>
              <li>Press <b>Save</b>.</li>
            </ol>
          </Step>

          <Step id="s2-4" title="2.4 Private house: consent for the transport service">
            <p>A private home address may only be stored with the person’s signed consent. Without consent the person travels on their own – the company provides no transport.</p>
            <Shot src="2d-staff-home" alt="Private house with consent" />
            <ol>
              <li>Choose <b>Private house (own address)</b>.</li>
              <li>Enter the <b>home address</b> (check “✓ Found on the map”).</li>
              <li>Press <b>Print consent form</b>. A ready form opens with your logo, the name and the address. Print it and let the person sign it. Keep the original in the personnel file.</li>
              <li>Tick <b>Signed consent is on file</b>.</li>
              <li>Enter the date of the signature (<b>Signed on</b>) and press <b>Save</b>.</li>
            </ol>
            <div className="tg-note tg-warn">If the person withdraws the consent: open the staff member, press <b>Withdraw consent</b> and then <b>Save</b>. The home address is deleted immediately.</div>
          </Step>

          <Step id="s2-5" title="2.5 Driver" sub="optional">
            <p>A staff member can also be a driver who brings the others to the jobs.</p>
            <Shot src="2e-staff-driver" alt="Driver" />
            <ol>
              <li>Tick <b>Driver – drives the staff</b>. Choose <i>All trips</i> or <i>Only some</i> (certain accommodations or areas on the map). The driver sees their trips for today and tomorrow in the staff app under “Trips”.</li>
            </ol>
          </Step>

          <Step id="s2-6" title="2.6 Access to the staff app">
            <p>So that the person sees their jobs on the phone. In the menu press <P>Access</P>.</p>
            <Shot src="2f-access" alt="Access" />
            <ol>
              <li>Next to the person press <b>+ Create access</b>.</li>
            </ol>
            <Shot src="2g-access-create" alt="Create access" />
            <ol>
              <li>Choose <b>Mobile number</b> (easiest for staff) or <b>Email</b>.</li>
              <li>Check the number or email.</li>
              <li>Press <b>Create</b>. A <b>temporary password</b> is shown <b>only once</b> – send it to the person. At the first sign-in they choose their own password.</li>
            </ol>
            <div className="tg-note">Managers and office staff get their access at the top: <b>+ Access for Manager / office</b>, with first name, last name and email.</div>
          </Step>
        </div>

        {/* ---------------- Chapter 3 ---------------- */}
        <div className="tg-ch" id="customers">
          <h2><span className="n">3</span>Customers</h2>
          <p className="lead">Contact details, addresses with map location and notes for your staff. You can also create a customer directly while creating a job.</p>

          <Step id="s3-1" title="3.1 Add a customer">
            <p>In the menu press <P>Customers</P>, then <b>+ Customer</b>.</p>
            <Shot src="3a-cust-list" alt="Customer list" />
          </Step>

          <Step id="s3-2" title="3.2 Contact details">
            <Shot src="3b-cust-new" alt="New customer" />
            <ol>
              <li><b>Type</b> – <i>Private person</i> or <i>Company</i>. For a company you enter the company name and a contact person.</li>
              <li><b>Name</b> (or company name) – required.</li>
              <li><b>Mobile / WhatsApp</b> – with country code. Each number can belong to only one customer.</li>
              <li><b>Notes for staff</b> – staff see this at every job (e.g. key, parking, pets). The <b>internal note</b> next to it is only for the office and managers.</li>
            </ol>
          </Step>

          <Step id="s3-3" title="3.3 Addresses (one or more)">
            <Shot src="3c-cust-addr" alt="Customer addresses" />
            <ol>
              <li>Type the <b>address</b>. “✓ Found on the map” means the location was found.</li>
              <li>For an exact location: in WhatsApp tap the location → Google Maps → Share → Copy link, then <b>Paste link</b>. On site you can press <b>My location here</b>. A <b>label</b> (e.g. Office, Apartment) helps later.</li>
              <li>A second address appears after step 4 – fill it in the same way.</li>
              <li><b>+ Another address</b> – for a second apartment, office or branch (up to 20).</li>
              <li>Press <b>Save</b>.</li>
            </ol>
          </Step>

          <Step id="s3-4" title="3.4 After saving: staff preferences and first job">
            <p>Open the customer again (tap the name in the list). Further down you find:</p>
            <Shot src="3d-cust-saved" alt="Staff for this customer" />
            <ol>
              <li><b>Preferred</b> – these people appear at the top when you assign staff.</li>
              <li><b>Please not</b> – these people are not suggested and cannot be assigned to this customer.</li>
              <li>The green button <b>+ Job for this customer</b> opens a new job with the customer and address already filled in.</li>
            </ol>
          </Step>

          <Step id="s3-5" title="3.5 The first job">
            <Shot src="3e-job" alt="New job" />
            <ol>
              <li><b>Date</b> of the job.</li>
              <li><b>Start</b> time. Choose the <b>Duration</b> next to it – the end time is calculated.</li>
              <li><b>Services</b> – tick one or more, then press <b>Finish</b>.</li>
              <li><b>Staff</b> – how many people are needed.</li>
              <li>Press <b>Save</b>. For regular appointments choose <b>Repeat</b> (every week, every 2 weeks, every month) before saving.</li>
            </ol>
            <div className="tg-note"><b>Staff available?</b> – the box under the appointment shows right away whether enough staff are free at this time (absences, other jobs, skills). If not, it suggests free times on the same day. <b>Find earliest appointment</b> searches the next 3 weeks within your working hours (1.3). Tap a suggestion to take over date and time.</div>
          </Step>

          <Step id="s3-6" title="3.6 Assign staff">
            <p>Open the job in <P>Jobs</P> and press <b>Assign staff</b>. Dienstigo shows the best people first: preferred by the customer → nearby → fewer hours worked. Press <b>Assign</b> next to a person, then <b>Finish</b>. The person sees the job in the staff app.</p>
            <Shot src="3f-assign" alt="Assign staff" size="mid" />
          </Step>
        </div>

        {/* ---------------- Chapter 4 ---------------- */}
        <div className="tg-ch" id="daily">
          <h2><span className="n">4</span>Daily work</h2>
          <p className="lead">Plan jobs while you are on the phone with the customer, and react quickly when someone cannot come.</p>

          <Step id="s4-1" title="4.1 Staff available? – while you talk to the customer">
            <p>As soon as you enter date, start, duration, number of staff and service in a job, the box <b>Staff available?</b> shows whether you have enough people – before you promise anything to the customer. Green = enough people, red = not enough.</p>
            <Shot src="4a-avail" alt="Staff available" />
            <ol>
              <li>How many people are free compared to how many are needed. Below: who is free, and who is not free and why (other job, absent, “please not” for this customer).</li>
              <li>Other jobs at the same time that do not have staff yet are counted too – they need people as well.</li>
              <li><b>Free time windows on this day</b> – e.g. “12:30–14:30”: the whole job fits into this window. Tap it to start at the beginning; you can then move the start time within the window.</li>
            </ol>
            <div className="tg-note">It is only a hint – you can still save. Absences count only if they are entered in Dienstigo (Requests or <b>Report absence</b>). Travel time between two jobs is not counted here; you see “tight” when you assign staff.</div>
          </Step>

          <Step id="s4-2" title="4.2 Find the earliest appointment">
            <Shot src="4b-earliest" alt="Find earliest appointment" />
            <ol>
              <li>Press <b>Find earliest appointment</b>. Dienstigo searches the next 3 weeks with the details you entered (duration, staff, services, customer) – only on working days and within your working hours (1.3).</li>
              <li>The first 3 days with enough free staff appear, each with all its free time windows (e.g. “07:00–20:00”). Tap a window – date and start time are filled in. Every start time within the window works.</li>
            </ol>
            <p>For a repeating job, the next appointments are checked too. You see a warning if one of them is short of staff.</p>
          </Step>

          <Step id="s4-3" title="4.3 Someone is sick or absent">
            <p>Open <P>Staff</P> and press <b>🤒 Report absence</b> next to the person (or approve their request under <P>Requests</P>). The affected jobs appear in the red box <b>Please check</b> at the top of <P>Jobs</P>.</p>
            <Shot src="4c-check" alt="Please check" />
            <ol>
              <li><b>Move …</b> – no replacement free? Move the job to a new time together with the customer (4.4).</li>
              <li><b>Find replacement</b> – another person takes over at the same time. The best suggestions are shown right away. If someone is absent for several days, <b>Replacement for all days</b> gives all jobs to one colleague.</li>
            </ol>
          </Step>

          <Step id="s4-4" title="4.4 Move an appointment – first agree with the customer">
            <Shot src="4d-move" alt="Move appointment" />
            <ol>
              <li>Choose the new <b>date</b> and <b>start</b>.</li>
              <li><b>Staff available?</b> shows if there are enough people. <b>Find earliest appointment</b> suggests the next free times.</li>
              <li>A message for the customer is ready. You can change the text.</li>
              <li>Send it with <b>WhatsApp</b> or press <b>Call</b>.</li>
              <li><b>Save (still open)</b> – the customer has not answered yet. Staff do not see the appointment yet.</li>
              <li><b>Customer agreed</b> – the job moves to the new time. Whoever is still absent on the new day is taken off the job, and <b>Assign staff</b> opens if someone is missing.</li>
            </ol>
          </Step>

          <Step id="s4-5" title="4.5 Waiting for the customer’s answer">
            <p>As long as the customer has not answered, the job stays in <b>Please check</b> with “moved – customer still has to agree”.</p>
            <Shot src="4e-open" alt="Open appointment" />
            <ol>
              <li>Press <b>Clarify</b> when the customer answers – then <b>Customer agreed</b>, or choose another time.</li>
            </ol>
          </Step>

          <Step id="s4-6" title="4.6 A job could not be finished">
            <p>If staff report “Not finished” in the app (or the office uses <b>Complete job …</b> → “Not finished – needs to continue”), Dienstigo creates a <b>continuation</b>. It appears in <b>Please check</b> with <b>Schedule</b>: agree a date with the customer in the same way (message, WhatsApp, <b>Customer agreed</b>). The first job is set to finished automatically when the continuation is done.</p>
          </Step>
        </div>

        <div className="tg-check">
          <h2>Checklist</h2>
          <ul>
            <li>☐ Logo and company details entered (1.1)</li>
            <li>☐ Working hours set (1.3)</li>
            <li>☐ Company accommodation / office created (1.5)</li>
            <li>☐ Skills and services created (1.6, 1.7)</li>
            <li>☐ All staff created with starting point and contract hours (2.2, 2.3)</li>
            <li>☐ Signed consent for everyone with a private house (2.4)</li>
            <li>☐ App access for every staff member (2.6)</li>
            <li>☐ Customers with addresses created (3.2, 3.3)</li>
            <li>☐ First job created and staff assigned (3.5, 3.6)</li>
            <li>☐ Team knows: absences go into Dienstigo, so “Staff available?” is correct (4.1, 4.3)</li>
          </ul>
          <p className="tg-noprint" style={{ marginTop: 14 }}><button type="button" className="tg-btn" onClick={() => window.print()}>🖨 Print / save as PDF</button></p>
        </div>
        <p className="tg-foot">Questions? Write to info@dienstigo.de</p>
      </main>
    </div>
  );
}
