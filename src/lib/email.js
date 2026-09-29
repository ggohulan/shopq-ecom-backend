// src/lib/email.js
//
// Generic SMTP sender - deliberately not tied to one provider. DreamHost
// includes email hosting for this domain, so the simplest path is an
// address on shopq.lk itself, but any SMTP-speaking provider (a transactional
// email service's SMTP relay, Gmail, etc.) works by changing only the env
// vars below. Same "blank env var = feature quietly does nothing" pattern
// as ANTHROPIC_API_KEY and the Meta Pixel vars - cart recovery (the only
// caller today) checks isEmailConfigured() itself before doing any work.
import nodemailer from 'nodemailer';

const globalForMail = global;

export function isEmailConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.SMTP_FROM);
}

function getTransport() {
  if (!globalForMail.__shopqMailTransport) {
    globalForMail.__shopqMailTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      // 465 is the implicit-TLS port; every other common port (587, 25, 2525)
      // starts plain and upgrades via STARTTLS, which nodemailer does on its
      // own when `secure` is false - hardcoding true for anything else would
      // fail the handshake against a plain-then-upgrade server.
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
  }
  return globalForMail.__shopqMailTransport;
}

export async function sendEmail({ to, subject, html, text }) {
  if (!isEmailConfigured()) {
    throw new Error('Email is not configured (SMTP_HOST/SMTP_USER/SMTP_PASSWORD/SMTP_FROM)');
  }
  const transport = getTransport();
  await transport.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
  });
}
