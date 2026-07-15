// utils/mailer.js
// ===============================
// Purpose: Send transactional emails (OTP for signup, password reset).
//
// Three modes (selected via MAIL_DRY_RUN env var):
//   - MAIL_DRY_RUN=true   → emails printed to server console (dev default)
//   - MAIL_DRY_RUN=false + real SMTP creds → emails sent via Nodemailer
//   - MAIL_DRY_RUN=false + missing creds → sendEmail() throws a clear error
//
// Why three modes:
//   In development you usually don't want a real OTP to land in a
//   real inbox. DRY_RUN mode shows the OTP in the server log so you
//   can copy-paste it. In production (or when you want to test real
//   delivery), set MAIL_DRY_RUN=false and provide real SMTP creds.
// ===============================

import "dotenv/config";
import nodemailer from "nodemailer";
import ApiError from "./apiError.js";


MAIL_DRY_RUN=false
// CONFIG VALIDATION
// Runs at module load. We log a clear warning if SMTP env vars are missing
// in production mode, so the developer sees it BEFORE the first email fails.
const validateMailConfig = () => {
  if (process.env.MAIL_DRY_RUN === "true") {
    console.info(
      "[EMAIL] MAIL_DRY_RUN=true — emails will be printed to the server console, not actually sent."
    );
    return;
  }

  // In real mode, all SMTP vars must be set. We also TRIM the values
  // because .env files often have trailing whitespace from copy-paste,
  // and a password like "abcd " (with trailing space) will silently
  // fail SMTP auth — wasting the user's time debugging.
  const required = ["MAIL_HOST", "MAIL_PORT", "MAIL_USER", "MAIL_PASS"];
  for (const key of required) {
    if (process.env[key]) process.env[key] = process.env[key].trim();
  }

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    // Use console.warn (not throw) so the server still starts. The first
    // sendEmail() call will throw a clear error pointing to the missing vars.
    console.warn(
      `[EMAIL] MAIL_DRY_RUN is not true and the following SMTP env vars are missing: ${missing.join(", ")}. ` +
      `Email sending will fail until these are set in server/.env.`
    );
  }
};
validateMailConfig();

// STARTUP CONNECTION TEST (only in real-SMTP mode)
// Verifies the SMTP credentials at boot, so the user finds out
// IMMEDIATELY if their App Password is wrong — not when a customer
// tries to sign up 30 minutes later. The result is logged but
// doesn't crash the server (we don't want one bad password to take
// down the whole API).
const runStartupSmtpTest = async () => {
  if (process.env.MAIL_DRY_RUN === "true") return;
  // Wait one tick so the "server running" log appears first
  await new Promise((r) => setImmediate(r));
  try {
    await transporter.verify();
    console.info(`[EMAIL] SMTP connection verified — ready to send to ${process.env.MAIL_USER}`);
  } catch (err) {
    const message = mapSmtpError(err);
    const raw = (err && err.message) || String(err);
    console.error(
      `\n[EMAIL:STARTUP-TEST FAILED] Could not authenticate with ${process.env.MAIL_HOST}:${process.env.MAIL_PORT} as ${process.env.MAIL_USER}\n` +
      `  Reason: ${message}\n` +
      `  Raw:    ${raw.slice(0, 500)}\n` +
      `  Tip:    Re-run with MAIL_DRY_RUN=true to keep the server working while you fix credentials.`
    );
  }
};
runStartupSmtpTest();

// TRANSPORTER (only created in real-SMTP mode)
const transporter =
  process.env.MAIL_DRY_RUN === "true"
    ? null
    : nodemailer.createTransport({
        host: process.env.MAIL_HOST,
        port: Number(process.env.MAIL_PORT) || 465,
        secure: Number(process.env.MAIL_PORT) === 465,
        auth: {
          user: process.env.MAIL_USER,
          pass: process.env.MAIL_PASS,
        },
      });

// MAP COMMON SMTP ERRORS to clearer messages
const mapSmtpError = (err) => {
  const raw = (err && err.message) || String(err);
  if (/Invalid login|535|Authentication failed/i.test(raw)) {
    return "SMTP authentication failed. Check MAIL_USER and MAIL_PASS in server/.env (for Gmail, use an App Password, not your account password).";
  }
  if (/ECONNREFUSED/i.test(raw)) {
    return `Could not reach SMTP server. Check MAIL_HOST and MAIL_PORT in server/.env (current: ${process.env.MAIL_HOST}:${process.env.MAIL_PORT}).`;
  }
  if (/ETIMEDOUT/i.test(raw)) {
    return "SMTP server timed out. Check your network or try a different MAIL_HOST/MAIL_PORT.";
  }
  if (/self signed certificate/i.test(raw)) {
    return "TLS certificate error. If you're using a self-hosted SMTP server, you may need to set `tls.rejectUnauthorized = false` in the transport config.";
  }
  return raw;
};

// SEND AN EMAIL
// to, subject, html — the standard Nodemailer interface
export const sendEmail = async ({ to, subject, html }) => {
  const isDryRun = process.env.MAIL_DRY_RUN === "true";

  // Build the From address. Default to the auth user (MAIL_USER) so
  // Gmail doesn't reject the email (Gmail requires From to match the
  // authenticated user, or be a verified "Send mail as" alias).
  const from =
    process.env.MAIL_FROM ||
    (process.env.MAIL_USER ? `FoodApp <${process.env.MAIL_USER}>` : "no-reply@foodapp.com");

  const mailOptions = { from, to, subject, html };

  try {
    if (isDryRun) {
      // In DRY_RUN mode, Nodemailer returns the rendered email as JSON
      // when you "send" via a JSON transport — but we just want to
      // print a clean summary to the console. Build it ourselves.
      const stripped = html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      const otpMatch = stripped.match(/\b(\d{6})\b/);   // 6-digit OTP
      console.info(`\n📧 [EMAIL:DRY-RUN] To: ${to} | Subject: ${subject}`);
      if (otpMatch) {
        console.info(`   → OTP / code: ${otpMatch[1]}`);
      } else {
        console.info(`   Body: ${stripped}`);
      }
      return { messageId: "DRY-RUN", preview: { to, subject, html } };
    }

    const info = await transporter.sendMail(mailOptions);
    console.info(`[EMAIL:SENT] To: ${to} | Subject: ${subject} | MessageId: ${info.messageId}`);
    return { messageId: info.messageId, preview: null };
  } catch (err) {
    const message = mapSmtpError(err);
    const raw = (err && err.message) || String(err);
    console.error(
      `[EMAIL:FAILED] To: ${to} | Subject: ${subject}\n` +
      `  Reason: ${message}\n` +
      `  Raw:    ${raw.slice(0, 500)}`
    );
    throw new ApiError(500, `Failed to send email: ${message}`);
  }
};

// Reusable email templates
// ===============================
// We keep the templates inline (not in separate .html files) because
// they're small and the code+template live together is easier to read.
// Each function returns { subject, html }.

// 1) Email verification OTP
export const sendVerificationOTPEmail = async (to, fullname, otp) => {
  const subject = "Your FoodApp verification code";
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h1 style="color: #D19254; margin-bottom: 8px;">Welcome to FoodApp${fullname ? `, ${fullname}` : ""}!</h1>
      <p>Use the code below to verify your email address. It expires in <b>10 minutes</b>.</p>
      <div style="background: #f5f5f4; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
        <span style="font-size: 36px; font-weight: bold; letter-spacing: 6px; color: #1f2937;">${otp}</span>
      </div>
      <p style="color: #6b7280; font-size: 14px;">If you didn't sign up, you can safely ignore this email.</p>
    </div>
  `;
  return sendEmail({ to, subject, html });
};

// 2) Password reset OTP
export const sendPasswordResetEmail = async (to, fullname, otp) => {
  const subject = "Your FoodApp password reset code";
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h1 style="color: #D19254; margin-bottom: 8px;">Reset your password</h1>
      <p>Hi ${fullname || "there"}, use the code below to reset your FoodApp password. It expires in <b>10 minutes</b>.</p>
      <div style="background: #f5f5f4; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
        <span style="font-size: 36px; font-weight: bold; letter-spacing: 6px; color: #1f2937;">${otp}</span>
      </div>
      <p style="color: #6b7280; font-size: 14px;">If you didn't request a reset, you can safely ignore this email.</p>
    </div>
  `;
  return sendEmail({ to, subject, html });
};

// Generate a 6-digit numeric OTP
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};
