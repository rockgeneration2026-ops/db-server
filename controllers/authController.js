import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";
import { sendVerificationEmail } from "../utils/mailer.js";

const isLocalAppUrl = () => /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(process.env.APP_URL || "http://localhost:5173");
const envAdminEmail = process.env.MASTER_ADMIN_EMAIL?.trim();
const envAdminPassword = process.env.MASTER_ADMIN_PASSWORD?.trim();
const envAdminName = process.env.MASTER_ADMIN_NAME?.trim() || "Master Admin";
const envAdminId = "env-master-admin";

const isEnvAdminCredentials = (email, password) =>
  Boolean(envAdminEmail && envAdminPassword && email === envAdminEmail && password === envAdminPassword);

const buildEnvAdminUser = () => ({
  id: envAdminId,
  name: envAdminName,
  email: envAdminEmail,
  role: "admin",
  status: "active",
  avatar_url: null,
  bio: "Environment-based master admin",
  email_verified_at: new Date().toISOString(),
  created_at: null
});

const signToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET || "change-this-secret",
    { expiresIn: "7d" }
  );

const hashVerificationToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const buildVerificationUrl = (token) => {
  const appUrl = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
  return `${appUrl}/verify-email?token=${token}`;
};

export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const [existing] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);

    if (existing.length) {
      return res.status(409).json({ message: "Email is already registered." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const rawVerificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenHash = hashVerificationToken(rawVerificationToken);
    const [result] = await pool.query(
      `INSERT INTO users
      (name, email, password_hash, role, status, email_verification_token, email_verification_sent_at)
      VALUES (?, ?, ?, 'user', 'active', ?, NOW())`,
      [name, email, passwordHash, verificationTokenHash]
    );
    const [rows] = await pool.query(
      "SELECT id, name, email, role, status, email_verified_at, created_at FROM users WHERE id = ?",
      [result.insertId]
    );

    const verificationUrl = buildVerificationUrl(rawVerificationToken);
    await sendVerificationEmail({ email, name, verificationUrl });

    return res.status(201).json({
      user: rows[0],
      message: "Registration successful. Please verify your email before logging in.",
      verificationRequired: true,
      verificationUrl: isLocalAppUrl() ? verificationUrl : undefined
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (isEnvAdminCredentials(email, password)) {
      const envAdminUser = buildEnvAdminUser();
      return res.json({
        token: signToken(envAdminUser),
        user: {
          id: envAdminUser.id,
          name: envAdminUser.name,
          email: envAdminUser.email,
          role: envAdminUser.role,
          status: envAdminUser.status
        }
      });
    }

    const [rows] = await pool.query(
      "SELECT id, name, email, role, status, password_hash, email_verified_at FROM users WHERE email = ?",
      [email]
    );
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    if (user.status !== "active") {
      return res.status(403).json({ message: "Account is not active." });
    }

    if (!user.email_verified_at) {
      return res.status(403).json({ message: "Please verify your email address before logging in." });
    }

    await pool.query("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);

    return res.json({
      token: signToken(user),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status
      }
    });
  } catch (error) {
    next(error);
  }
};

export const me = async (req, res, next) => {
  try {
    if (req.user.id === envAdminId && req.user.email === envAdminEmail) {
      return res.json(buildEnvAdminUser());
    }

    const [rows] = await pool.query(
      "SELECT id, name, email, role, status, avatar_url, bio, email_verified_at, created_at FROM users WHERE id = ?",
      [req.user.id]
    );
    res.json(rows[0] || null);
  } catch (error) {
    next(error);
  }
};

export const verifyEmail = async (req, res, next) => {
  try {
    const token = req.body.token?.trim();

    if (!token) {
      return res.status(400).json({ message: "Verification token is required." });
    }

    const tokenHash = hashVerificationToken(token);
    const [rows] = await pool.query(
      `SELECT id, email_verified_at
       FROM users
       WHERE email_verification_token = ?
       LIMIT 1`,
      [tokenHash]
    );

    if (!rows.length) {
      return res.status(400).json({ message: "Invalid or expired verification link." });
    }

    if (rows[0].email_verified_at) {
      return res.json({ message: "Email already verified." });
    }

    await pool.query(
      `UPDATE users
       SET email_verified_at = NOW(),
           email_verification_token = NULL
       WHERE id = ?`,
      [rows[0].id]
    );

    res.json({ message: "Email verified successfully. You can now log in." });
  } catch (error) {
    next(error);
  }
};

export const resendVerificationEmail = async (req, res, next) => {
  try {
    const email = req.body.email?.trim();

    if (!email) {
      return res.status(400).json({ message: "Email is required." });
    }

    const [rows] = await pool.query(
      "SELECT id, name, email, email_verified_at FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Account not found." });
    }

    const user = rows[0];

    if (user.email_verified_at) {
      return res.status(400).json({ message: "Email is already verified." });
    }

    const rawVerificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenHash = hashVerificationToken(rawVerificationToken);

    await pool.query(
      "UPDATE users SET email_verification_token = ?, email_verification_sent_at = NOW() WHERE id = ?",
      [verificationTokenHash, user.id]
    );

    const verificationUrl = buildVerificationUrl(rawVerificationToken);
    await sendVerificationEmail({ email: user.email, name: user.name, verificationUrl });

    res.json({
      message: "Verification email sent.",
      verificationUrl: isLocalAppUrl() ? verificationUrl : undefined
    });
  } catch (error) {
    next(error);
  }
};
