import net from "node:net";
import tls from "node:tls";
import { randomUUID } from "node:crypto";

// SERVER ONLY. Sends one plain-text e-mail through the SMTP server of our own mailbox (IONOS: info@dienstigo.de).
// No extra package: only Node's own net/tls. Settings come from Vercel → Environment Variables:
//   SMTP_HOST (smtp.ionos.de), SMTP_PORT (465 = TLS from the start; 587 = STARTTLS), SMTP_USER, SMTP_PASS.
// The password is never logged or returned. Every header value is cleaned of line breaks (no header injection);
// the body is base64, so a line starting with "." can never end the message early.

const clean = (s) => String(s == null ? "" : s).replace(/[\r\n]+/g, " ").trim();
const b64 = (s) => Buffer.from(String(s), "utf8").toString("base64");
const word = (s) => (/^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`); // RFC 2047 for umlauts

export function smtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function buildMessage({ from, fromName, to, replyTo, subject, text }) {
  const body = b64(String(text).replace(/\r?\n/g, "\r\n")).replace(/.{1,76}/g, "$&\r\n");
  const domain = clean(from).split("@")[1] || "localhost";
  return [
    `From: ${fromName ? `${word(clean(fromName))} ` : ""}<${clean(from)}>`,
    `To: <${clean(to)}>`,
    replyTo ? `Reply-To: <${clean(replyTo)}>` : null,
    `Subject: ${word(clean(subject))}`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    body,
  ].filter((l) => l !== null).join("\r\n");
}

// opts (tests only): { host, port, user, pass, secure, tlsOptions }
export async function sendMail({ to, replyTo, subject, text, fromName = "Dienstigo Website" }, opts = {}) {
  const host = opts.host || process.env.SMTP_HOST;
  const port = Number(opts.port || process.env.SMTP_PORT || 465);
  const user = opts.user || process.env.SMTP_USER;
  const pass = opts.pass || process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error("SMTP nicht eingerichtet");
  const secure = opts.secure != null ? !!opts.secure : port === 465; // 465 = TLS from the start, else STARTTLS
  const tlsOptions = { servername: host, ...(opts.tlsOptions || {}) };

  let sock = secure ? tls.connect({ host, port, ...tlsOptions }) : net.connect({ host, port });
  let buf = "", waiter = null, failed = null;
  const onData = (d) => { buf += d.toString("utf8"); pump(); };
  const onErr = (e) => { failed = e; if (waiter) { const w = waiter; waiter = null; w.reject(e); } };
  function pump() {
    if (!waiter) return;
    const lines = buf.split("\r\n");
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^\d{3}(?: |$)/.test(lines[i])) {   // last line of a (multi-line) reply; text after the code is optional
        const reply = lines.slice(0, i + 1).join("\n");
        buf = lines.slice(i + 1).join("\r\n");
        const w = waiter; waiter = null; w.resolve({ code: Number(lines[i].slice(0, 3)), reply });
        return;
      }
    }
  }
  const attach = (s) => { s.on("data", onData); s.on("error", onErr); s.setTimeout(20000, () => onErr(new Error("SMTP Zeitüberschreitung"))); };
  attach(sock);
  const read = () => new Promise((resolve, reject) => { if (failed) return reject(failed); waiter = { resolve, reject }; pump(); });
  async function cmd(line, ok, label) {
    if (line !== null) sock.write(line + "\r\n");
    const r = await read();
    if (!ok.includes(r.code)) throw new Error(`SMTP ${label || "Fehler"}: ${r.code}`); // reply text not included (may echo data)
    return r;
  }

  try {
    await cmd(null, [220], "Begrüßung");
    const ehlo = await cmd("EHLO dienstigo.de", [250], "EHLO");
    if (!secure) {
      if (!/STARTTLS/i.test(ehlo.reply)) throw new Error("SMTP: Server bietet kein STARTTLS");
      await cmd("STARTTLS", [220], "STARTTLS");
      sock.removeListener("data", onData);
      sock = await new Promise((resolve, reject) => {
        const t = tls.connect({ socket: sock, ...tlsOptions }, () => resolve(t));
        t.once("error", reject);
      });
      buf = ""; attach(sock);
      await cmd("EHLO dienstigo.de", [250], "EHLO");
    }
    await cmd("AUTH LOGIN", [334], "Anmeldung");
    await cmd(b64(user), [334], "Anmeldung");
    await cmd(b64(pass), [235], "Anmeldung (Benutzer oder Passwort falsch?)");
    await cmd(`MAIL FROM:<${clean(user)}>`, [250], "Absender");
    await cmd(`RCPT TO:<${clean(to)}>`, [250, 251], "Empfänger");
    await cmd("DATA", [354], "DATA");
    await cmd(buildMessage({ from: user, fromName, to, replyTo, subject, text }) + "\r\n.", [250], "Senden");
    try { sock.write("QUIT\r\n"); } catch (e) { /* ignore */ }
  } finally {
    setTimeout(() => { try { sock.destroy(); } catch (e) { /* ignore */ } }, 200);
  }
  return true;
}
