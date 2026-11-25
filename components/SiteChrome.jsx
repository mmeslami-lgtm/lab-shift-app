"use client";

import React, { useEffect, useState } from "react";
import { useSiteLang, LangSwitch } from "./SiteLang";

// Gemeinsamer Rahmen der öffentlichen Seiten (25.11.2026): Kopf mit Menü (auf dem Handy ☰), Fuß mit allen Seiten,
// gemeinsames CSS. Startseite, Produkte, Über uns, Fragen, Kontakt benutzen ihn. Sprache DE/EN über useSiteLang.
export const SITE_CSS = `
.dg{--dg-display:"Avenir Next","Segoe UI Variable Display","Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif;--dg-body:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;--paper:#F3F5F9;--ink:#18233A;--navy:#243B6B;--muted:#56617A;--line:#DCE2EC;--f:#D6EAF8;--f-t:#0E5E8C;--s:#D8F0E0;--s-t:#1E6B3E;--n:#24345A;--n-t:#E9EEF8;--u:#ECE3FA;--u-t:#5B3A99;--now:#E3A72F;
  background:var(--paper);color:var(--ink);font-family:var(--dg-body),system-ui,sans-serif;font-size:1.0625rem;line-height:1.6;-webkit-font-smoothing:antialiased}
.dg *{box-sizing:border-box}
.dg a{color:inherit}
.dg :focus-visible{outline:3px solid var(--now);outline-offset:3px;border-radius:6px}
.dg-wrap{max-width:1120px;margin:0 auto;padding:0 22px}
.dg-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 0}
.dg-mark{font-family:var(--dg-display),system-ui,sans-serif;font-weight:700;font-size:1.6rem;letter-spacing:-.03em;color:var(--navy);text-decoration:none}
.dg-mark{position:relative;padding:0;background:none;width:auto;height:auto;display:inline-block;border-radius:0;flex:none}.dg-mark::before,.dg-mark::after{display:none!important;content:none!important}
.dg-nav{display:flex;flex-direction:row;align-items:center;gap:22px;font-size:.98rem;background:none;border:0;box-shadow:none;padding:0;margin:0;position:static;width:auto;height:auto}
.dg-nav a.dg-l{text-decoration:none;color:var(--muted)}
.dg-nav a.dg-l:hover{color:var(--ink)}
.dg-btn{display:inline-block;white-space:nowrap;text-decoration:none;font-weight:700;border-radius:12px;padding:12px 20px;font-size:1rem;line-height:1.2;transition:transform .08s ease,background-color .15s ease}
.dg-btn:active{transform:translateY(1px)}
.dg-primary{background:var(--navy);color:#fff!important}
.dg-primary:hover{background:#1B2E57}
.dg-ghost{border:1.5px solid #AEBBD3;color:var(--ink)!important;background:#fff}
.dg-ghost:hover{border-color:var(--navy)}
.dg-menu{position:relative;display:inline-block}
.dg-menu-btn{cursor:pointer;font-family:inherit}
.dg-menu-btn::after{content:"";display:inline-block;margin-left:8px;width:7px;height:7px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:translateY(-3px) rotate(45deg);transition:transform .15s}
.dg-open .dg-menu-btn::after{transform:translateY(1px) rotate(-135deg)}
.dg-drop{position:absolute;top:calc(100% + 8px);z-index:30;min-width:270px;background:#fff;border:1px solid var(--line);border-radius:16px;padding:6px;box-shadow:0 22px 44px -20px rgba(24,35,58,.45);animation:dg-pop .16s ease-out}
.dg-drop-right{right:0}.dg-drop-left{left:0}
.dg-drop::before{content:"";position:absolute;left:0;right:0;top:-10px;height:10px}
.dg-drop a{display:block;text-decoration:none;color:var(--ink);padding:11px 14px;border-radius:11px}
.dg-drop a:hover,.dg-drop a:focus-visible{background:#EEF2F8}
.dg-drop a b{display:block;font-size:1rem}
.dg-drop a span{display:block;font-size:.85rem;color:var(--muted)}
.dg-hero{display:grid;grid-template-columns:1.05fr 1fr;gap:56px;align-items:center;padding:40px 0 88px}
.dg-h1{font-family:var(--dg-display),system-ui,sans-serif;font-weight:700;font-size:clamp(1.9rem,3.4vw,2.85rem);line-height:1.12;letter-spacing:-.028em;margin:0 0 18px;color:var(--ink)}
.dg-h1 em{font-style:normal;background:linear-gradient(90deg,#243B6B,#2BB3A3,#4C7BD9,#243B6B);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:dg-shine 9s ease-in-out infinite}
@keyframes dg-shine{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
.dg-lead{font-size:1.08rem;line-height:1.6;color:#2E3A52;margin:0 0 30px;max-width:34em}
.dg-cta{display:flex;flex-wrap:wrap;gap:12px}
.dg-note{margin-top:22px;font-size:.95rem;color:var(--muted)}
.dg-plan{background:#fff;border:1px solid var(--line);border-radius:22px;padding:18px 18px 40px;position:relative;box-shadow:0 24px 50px -28px rgba(36,59,107,.35)}
.dg-plan-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px}
.dg-plan-title{font-family:var(--dg-display),system-ui,sans-serif;font-weight:600;font-size:1.05rem}
.dg-plan-sub{font-size:.85rem;color:var(--muted)}
.dg-grid{display:grid;grid-template-columns:minmax(52px,72px) repeat(7,1fr);gap:6px;align-items:center}
.dg-day{text-align:center;font-size:.8rem;color:var(--muted);padding:4px 0;border-radius:8px}
.dg-day.dg-today{color:var(--ink);font-weight:700;box-shadow:inset 0 -3px 0 var(--now)}
.dg-name{font-size:.86rem;font-weight:700;color:#33405A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dg-cell{height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.82rem}
.dg-cell.dg-free{border:1.5px dashed #E1E6EF}
.dg-F{background:var(--f);color:var(--f-t)}.dg-S{background:var(--s);color:var(--s-t)}.dg-N{background:var(--n);color:var(--n-t)}.dg-U{background:var(--u);color:var(--u-t)}
.dg-col-today{outline:2px solid rgba(227,167,47,.55);outline-offset:1px}
.dg-legend{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px;font-size:.8rem;color:var(--muted)}
.dg-legend span{display:inline-flex;align-items:center;gap:6px}
.dg-legend i{width:12px;height:12px;border-radius:4px;display:inline-block}
.dg-stamp{position:absolute;right:-14px;bottom:-22px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:10px 14px;font-size:.88rem;box-shadow:0 14px 30px -18px rgba(24,35,58,.45);display:flex;align-items:center;gap:10px}
.dg-dot{width:10px;height:10px;border-radius:50%;background:#1F9D55;box-shadow:0 0 0 4px rgba(31,157,85,.18)}
@keyframes dg-fill{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
@keyframes dg-pop{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.dg-cell{animation:dg-fill .38s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--i) * 38ms + 250ms)}
.dg-stamp{animation:dg-pop .45s ease-out both;animation-delay:1.75s}
@media (prefers-reduced-motion:reduce){.dg-cell,.dg-stamp{animation:none}}
.dg-sec{padding:84px 0;border-top:1px solid var(--line)}
.dg-h2{font-family:var(--dg-display),system-ui,sans-serif;font-weight:700;font-size:clamp(1.55rem,2.6vw,2.1rem);letter-spacing:-.03em;line-height:1.1;margin:0 0 40px;max-width:20em}
.dg-feats{display:grid;grid-template-columns:1fr 1fr;column-gap:64px;row-gap:40px}
.dg-feat h3{font-family:var(--dg-display),system-ui,sans-serif;font-weight:600;font-size:1.3rem;letter-spacing:-.015em;margin:0 0 8px}
.dg-feat p{margin:0;color:#3A465E;max-width:32em}
.dg-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:28px;list-style:none;padding:0;margin:0;counter-reset:s}
.dg-step{position:relative;padding-top:56px}
.dg-step::before{counter-increment:s;content:counter(s);position:absolute;top:0;left:0;width:40px;height:40px;border-radius:50%;background:var(--navy);color:#fff;font-family:var(--dg-display),system-ui,sans-serif;font-weight:700;display:flex;align-items:center;justify-content:center}
.dg-step::after{content:"";position:absolute;top:20px;left:52px;right:-16px;height:2px;background:var(--line)}
.dg-step:last-child::after{display:none}
.dg-step h3{font-family:var(--dg-display),system-ui,sans-serif;font-weight:600;font-size:1.2rem;margin:0 0 6px}
.dg-step p{margin:0;color:#3A465E;font-size:1rem}
.dg-who{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:start}
.dg-who p{margin:0 0 14px;color:#3A465E;max-width:34em}
.dg-who strong{color:var(--ink)}
.dg-origin{border-left:4px solid var(--now);padding:4px 0 4px 22px}
.dg-origin p:first-child{font-family:var(--dg-display),system-ui,sans-serif;font-weight:600;font-size:1.45rem;line-height:1.3;color:var(--ink);letter-spacing:-.015em}
.dg-end{background:var(--navy);color:#fff;border-radius:28px;padding:56px 48px;margin:0 0 72px;display:flex;justify-content:space-between;align-items:center;gap:32px;flex-wrap:wrap}
.dg-end h2{font-family:var(--dg-display),system-ui,sans-serif;font-weight:700;font-size:clamp(1.8rem,3.2vw,2.4rem);letter-spacing:-.03em;margin:0 0 8px;color:#fff}
.dg-end p{margin:0;color:#D5DDEE;max-width:30em}
.dg-end .dg-primary{background:#fff;color:var(--navy)!important}
.dg-end .dg-primary:hover{background:#E9EEF8}
.dg-end a.dg-mail{color:#fff;font-weight:700}
@media (max-width:900px){
  .dg-hero{grid-template-columns:1fr;gap:44px;padding:20px 0 72px}
  .dg-feats,.dg-who{grid-template-columns:1fr;gap:32px}
  .dg-steps{grid-template-columns:1fr 1fr;row-gap:36px}
  .dg-step:nth-child(2)::after{display:none}
  .dg-stamp{right:10px}
}
@media (max-width:560px){
  .dg-nav a.dg-l{display:none}
  .dg-nav{gap:10px}
  .dg-btn{padding:11px 15px}
  .dg-top .dg-primary{display:none}
  .dg-steps{grid-template-columns:1fr}
  .dg-step::after{display:none}
  .dg-sec{padding:64px 0}
  .dg-end{padding:40px 26px;border-radius:22px}
  .dg-plan{padding:14px 12px 40px}
  .dg-grid{gap:4px;grid-template-columns:48px repeat(7,1fr)}
  .dg-cell{height:30px;font-size:.75rem}
}
.dg-tour{display:grid;grid-template-columns:1.05fr 1fr;gap:34px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:22px;padding:28px}
.dg-tour img{width:100%;border-radius:14px;border:1px solid var(--line);box-shadow:0 16px 34px -22px rgba(24,35,58,.5)}
.dg-tour ul{margin:12px 0 18px;padding:0;list-style:none}
.dg-tour li{position:relative;padding-left:26px;margin:0 0 10px}
.dg-tour li::before{content:"";position:absolute;left:0;top:.55em;width:12px;height:12px;border-radius:4px;background:#2BB3A3}
.dg-kicker{display:inline-block;font-size:.8rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#1F8A80;margin-bottom:6px}
.dg-langbox{display:flex;align-items:center}
@media (max-width:900px){.dg-tour{grid-template-columns:1fr;padding:20px}}

/* 25.11.2026: gemeinsamer Rahmen der öffentlichen Seiten, 3D-Bilder, Karten */
.dg{position:relative;overflow-x:clip}
.dg-bg{position:absolute;inset:0 0 auto 0;height:900px;pointer-events:none;z-index:0;overflow:hidden}
.dg-bg::before,.dg-bg::after{content:"";position:absolute;border-radius:50%;filter:blur(40px)}
.dg-bg::before{width:620px;height:420px;right:-80px;top:-60px;background:rgba(43,179,163,.20);animation:dg-drift 18s ease-in-out infinite}
.dg-bg::after{width:700px;height:460px;left:-160px;top:-140px;background:rgba(36,59,107,.14);animation:dg-drift 22s ease-in-out infinite reverse}
@keyframes dg-drift{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-60px,50px) scale(1.12)}}
.dg-wrap{position:relative;z-index:1}
.dg-nav a.dg-l[aria-current="page"]{color:var(--ink);font-weight:700}
.dg-burger{display:none;border:1.5px solid #AEBBD3;background:#fff;border-radius:12px;width:44px;height:44px;cursor:pointer;align-items:center;justify-content:center;padding:0}
.dg-burger i,.dg-burger i::before,.dg-burger i::after{display:block;width:18px;height:2px;background:var(--ink);border-radius:2px;position:relative;content:""}
.dg-burger i::before{position:absolute;top:-6px}.dg-burger i::after{position:absolute;top:6px}
.dg-mob{display:none}
.dg-stage{position:relative;perspective:1600px;min-height:430px}
.dg-3d{position:absolute;border-radius:16px;overflow:hidden;background:#fff;border:1px solid var(--line);box-shadow:0 40px 70px -30px rgba(24,35,58,.55),0 12px 24px -16px rgba(24,35,58,.35);transform-style:preserve-3d;transition:transform .6s cubic-bezier(.2,.7,.2,1)}
.dg-3d img{display:block;width:100%;height:auto}
.dg-stage{--rx:0deg;--ry:0deg}
.dg-3d-desk{left:0;top:10px;width:88%;transform:rotateY(calc(-14deg + var(--ry))) rotateX(calc(7deg + var(--rx))) rotateZ(1deg);animation:dg-sway 7s ease-in-out infinite}
.dg-3d-phone{right:0;bottom:-10px;width:36%;border-radius:26px;border:7px solid #1B2433;transform:rotateY(calc(-10deg + var(--ry) * 1.6)) rotateX(calc(6deg + var(--rx) * 1.6)) translateZ(80px);animation:dg-sway 6s ease-in-out -2s infinite;transition:transform .25s ease-out}
.dg-3d-desk{transition:transform .25s ease-out}
@keyframes dg-sway{0%,100%{translate:0 0}50%{translate:0 -12px}}
.dg-in-hero{animation:dg-rise .9s cubic-bezier(.2,.7,.2,1) both}
.dg-3d-phone.dg-in-hero{animation:dg-rise .9s cubic-bezier(.2,.7,.2,1) .35s both,dg-sway 6s ease-in-out 1.3s infinite}
.dg-3d-desk.dg-in-hero{animation:dg-rise .9s cubic-bezier(.2,.7,.2,1) .1s both,dg-sway 7s ease-in-out 1s infinite}
@keyframes dg-rise{from{opacity:0;translate:0 40px}to{opacity:1;translate:0 0}}
.dg-float{position:absolute;z-index:3;background:#fff;border:1px solid var(--line);border-radius:14px;padding:10px 14px;font-size:.88rem;box-shadow:0 18px 34px -18px rgba(24,35,58,.5);display:flex;align-items:center;gap:10px;animation:dg-bob 5s ease-in-out infinite}
@keyframes dg-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.dg-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(196px,1fr));gap:18px}
.dg-card{display:flex;flex-direction:column;background:#fff;border:1px solid var(--line);border-radius:20px;overflow:hidden;text-decoration:none;color:var(--ink);box-shadow:0 18px 36px -28px rgba(24,35,58,.45);transition:transform .25s ease,box-shadow .25s ease}
.dg-card:hover{transform:translateY(-6px) rotateX(2deg);box-shadow:0 30px 50px -28px rgba(24,35,58,.55)}
.dg-card-img{height:170px;background:linear-gradient(135deg,#E9EEF6,#F6F8FC);display:flex;align-items:flex-end;justify-content:center;overflow:hidden;perspective:900px;padding:16px 16px 0}
.dg-card-img img{width:86%;border-radius:10px 10px 0 0;box-shadow:0 16px 30px -18px rgba(24,35,58,.6);transform:rotateX(14deg);transform-origin:bottom;object-fit:cover;object-position:top;height:150px}
.dg-card-img.dg-phone img{width:62%;height:160px;border-radius:16px 16px 0 0;border:5px solid #1B2433;border-bottom:0}
.dg-card-b{padding:18px 20px 22px}
.dg-card-b h3{font-family:var(--dg-display),system-ui,sans-serif;font-size:1.2rem;font-weight:700;margin:0 0 6px;letter-spacing:-.01em}
.dg-card-b p{margin:0 0 12px;color:#3A465E;font-size:.98rem}
.dg-card-b span.dg-more{font-weight:700;color:var(--navy)}
.dg-page-h{padding:30px 0 34px}
.dg-page-h .dg-h1{max-width:20em}
.dg-crumb{font-size:.9rem;color:var(--muted);margin:6px 0 10px}
.dg-crumb a{color:var(--navy);text-decoration:none;font-weight:600}
.dg-foot{border-top:1px solid var(--line);margin-top:56px;padding:30px 0 10px;display:flex;flex-wrap:wrap;gap:12px 26px;justify-content:space-between;align-items:center;font-size:.95rem}
.dg-foot nav{display:flex;flex-wrap:wrap;gap:10px 22px}
.dg-foot a{text-decoration:none;color:var(--muted)}
.dg-foot a:hover{color:var(--ink)}
@media (max-width:900px){.dg-stage{min-height:0;height:auto;aspect-ratio:1.25}}
@media (max-width:820px){
  .dg-nav a.dg-l{display:none}
  .dg-burger{display:inline-flex}
  .dg-top .dg-ghost{display:none}
  .dg-3d-phone{right:3%}
  .dg-mob{display:block;position:absolute;right:22px;top:76px;z-index:40;min-width:240px;background:#fff;border:1px solid var(--line);border-radius:16px;padding:6px;box-shadow:0 22px 44px -20px rgba(24,35,58,.45);animation:dg-pop .16s ease-out}
  .dg-mob a{display:block;padding:11px 14px;border-radius:11px;text-decoration:none;color:var(--ink);font-weight:600}
  .dg-mob a:hover{background:#EEF2F8}
}
.dg-rv{opacity:0;translate:0 34px;transition:opacity .7s ease,translate .7s cubic-bezier(.2,.7,.2,1)}
.dg-rv.dg-in{opacity:1;translate:0 0}
.dg-card-img img,.dg-card-img .dg-scene-wrap{transition:transform .5s cubic-bezier(.2,.7,.2,1)}
.dg-card:hover .dg-card-img img,.dg-card:hover .dg-card-img .dg-scene-wrap{transform:rotateX(0deg) scale(1.04)}
.dg-btn.dg-primary{position:relative;overflow:hidden}
.dg-btn.dg-primary::after{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.35),transparent);transform:skewX(-20deg);animation:dg-glint 6s ease-in-out 2s infinite}
@keyframes dg-glint{0%,80%{left:-60%}100%{left:130%}}
.dg-logo{background:linear-gradient(110deg,#243B6B 42%,#9FE3DA 50%,#243B6B 58%);background-size:260% 100%;background-position:120% 0;-webkit-background-clip:text;background-clip:text;color:transparent;animation:dg-logo 6s ease-in-out 1.2s infinite}
@keyframes dg-logo{0%,70%{background-position:120% 0}100%{background-position:-20% 0}}
@media (prefers-reduced-motion:reduce){.dg-float,.dg-3d,.dg-bg::before,.dg-bg::after,.dg-h1 em,.dg-btn.dg-primary::after,.dg-logo{animation:none!important}.dg-3d,.dg-card,.dg-rv{transition:none}.dg-rv{opacity:1;translate:none}}
`;

export const NAV = {
  de: { home: "Dienstigo Startseite", nav: "Hauptnavigation", products: "Produkte", tour: "Rundgang", about: "Über uns", faq: "Fragen", contact: "Kontakt", login: "Anmelden", register: "Jetzt registrieren", menu: "Menü", footNav: "Alle Seiten", back: "Startseite" },
  en: { home: "Dienstigo home page", nav: "Main navigation", products: "Products", tour: "Tour", about: "About us", faq: "FAQ", contact: "Contact", login: "Sign in", register: "Register now", menu: "Menu", footNav: "All pages", back: "Home" },
};

export function SiteShell({ active, children, before = null }) {
  const lang = useSiteLang();
  const N = NAV[lang];
  const [open, setOpen] = useState(false);
  const links = [["products", "/produkte"], ["tour", "/demo"], ["about", "/ueber-uns"], ["faq", "/fragen"], ["contact", "/kontakt"]];
  const cur = (k) => (k === active ? "page" : undefined);
  // Bewegung: Abschnitte und Karten unterhalb des Bildschirms gleiten beim Scrollen herein (gestaffelt).
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return undefined;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const els = Array.from(document.querySelectorAll(".dg h2.dg-h2, .dg-card, .dg-point, .dg-feat, .dg-step, .dg-end, .dg-tour, .dg-who > div, .dg-faq details, .dg-block"));
    const io = new IntersectionObserver((list) => list.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("dg-in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
    els.forEach((el) => {
      if (el.classList.contains("dg-in")) return;
      if (el.classList.contains("dg-rv")) { io.observe(el); return; }
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
      const sib = el.parentElement ? Array.from(el.parentElement.children).indexOf(el) : 0;
      el.style.transitionDelay = `${Math.min(sib, 5) * 90}ms`;
      el.classList.add("dg-rv");
      io.observe(el);
    });
    return () => io.disconnect();
  }, [lang, active]);
  return (
    <div className="dg" lang={lang}>
      {before}
      <style dangerouslySetInnerHTML={{ __html: SITE_CSS }} />
      <div className="dg-bg" aria-hidden="true" />
      <div className="dg-wrap">
        <header className="dg-top">
          <a href="/" className="dg-mark" aria-label={N.home}><span className="dg-logo">Dienstigo</span></a>
          <nav className="dg-nav" aria-label={N.nav}>
            {links.slice(0, 4).map(([k, h]) => <a key={k} className="dg-l" href={h} aria-current={cur(k)}>{N[k]}</a>)}
            <a className="dg-btn dg-ghost" href="/login">{N.login}</a>
            <a className="dg-btn dg-primary" href="/registrieren">{N.register}</a>
            <span className="dg-langbox"><LangSwitch lang={lang} /></span>
            <button type="button" className="dg-burger" aria-label={N.menu} aria-expanded={open} onClick={() => setOpen((v) => !v)}><i /></button>
          </nav>
          {open && (
            <div className="dg-mob" role="menu">
              <a href="/" role="menuitem">{N.back}</a>
              {links.map(([k, h]) => <a key={k} href={h} role="menuitem" aria-current={cur(k)}>{N[k]}</a>)}
              <a href="/registrieren" role="menuitem">{N.register}</a>
              <a href="/login" role="menuitem">{N.login}</a>
            </div>
          )}
        </header>
        {typeof children === "function" ? children(lang) : children}
        <footer className="dg-foot">
          <a href="/" className="dg-mark" style={{ fontSize: "1.25rem" }}><span className="dg-logo">Dienstigo</span></a>
          <nav aria-label={N.footNav}>
            <a href="/">{N.back}</a>
            {links.map(([k, h]) => <a key={k} href={h}>{N[k]}</a>)}
            <a href="/registrieren">{N.register}</a>
            <a href="/login">{N.login}</a>
          </nav>
        </footer>
      </div>
    </div>
  );
}
