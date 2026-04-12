import nodemailer from "nodemailer";
import { pool } from "../config/db.js";

const parseJsonValue = (value) => {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
};

const getSmtpSettings = async () => {
  const [rows] = await pool.query(
    "SELECT setting_value FROM site_settings WHERE setting_key = 'smtp_settings' LIMIT 1"
  );

  return parseJsonValue(rows[0]?.setting_value);
};

const createTransporter = async () => {
  const smtp = await getSmtpSettings();

  if (smtp?.host) {
    return nodemailer.createTransport({
      host: smtp.host,
      port: Number(smtp.port || 587),
      secure: Boolean(smtp.secure),
      auth: smtp.user
        ? {
            user: smtp.user,
            pass: smtp.pass
          }
        : undefined
    });
  }

  return nodemailer.createTransport({
    streamTransport: true,
    newline: "unix",
    buffer: true
  });
};

export const sendVerificationEmail = async ({ email, name, verificationCode, verificationUrl }) => {
  const smtp = await getSmtpSettings();
  const activeTransporter = await createTransporter();
  const from = smtp?.from || "Darkgorkha <no-reply@darkgorkha.com>";

  const codeBlock = verificationCode
    ? `<div style="margin:24px 0;padding:18px 24px;border-radius:18px;background:#0ea5e9;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:0.2em;text-align:center;">${verificationCode}</div>`
    : "";

  const fallbackLink = verificationUrl
    ? `<p style="line-height:1.7">If you prefer, you can also verify with this link:</p>
       <p style="word-break:break-all;color:#7dd3fc">${verificationUrl}</p>`
    : "";

  const info = await activeTransporter.sendMail({
    from,
    to: email,
    subject: "Verify your Darkgorkha account",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#020617;color:#e2e8f0">
        <h1 style="color:#ffffff;margin-bottom:12px">Verify your email</h1>
        <p style="line-height:1.7">Hi ${name || "there"},</p>
        <p style="line-height:1.7">Thanks for registering on Darkgorkha. Please verify your email address to activate your account and log in.</p>
        <p style="line-height:1.7">Use this verification code on the verification page:</p>
        ${codeBlock}
        <p style="line-height:1.7">Enter the code on the Darkgorkha verify page to complete registration.</p>
        ${fallbackLink}
      </div>
    `
  });

  if (!smtp?.host && info.message) {
    console.log("Verification email preview:");
    console.log(info.message.toString());
  }
};
