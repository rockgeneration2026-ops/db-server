import { pool } from "../config/db.js";
import bcrypt from "bcryptjs";

const parseSettingValue = (value) => {
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

export const getDashboardStats = async (req, res, next) => {
  try {
    const queries = await Promise.all([
      pool.query("SELECT COUNT(*) AS count FROM tools"),
      pool.query("SELECT COUNT(*) AS count FROM calculators"),
      pool.query("SELECT COUNT(*) AS count FROM ai_tools"),
      pool.query("SELECT COUNT(*) AS count FROM blogs"),
      pool.query("SELECT COUNT(*) AS count FROM users"),
      pool.query("SELECT COUNT(*) AS count FROM comments WHERE status = 'pending'"),
      pool.query("SELECT COUNT(*) AS count FROM tool_submissions WHERE status = 'pending'"),
      pool.query("SELECT DATE(created_at) AS day, COUNT(*) AS total FROM analytics_events GROUP BY DATE(created_at) ORDER BY day DESC LIMIT 7"),
      pool.query("SELECT COUNT(*) AS count FROM ads"),
      pool.query("SELECT COUNT(*) AS count FROM ads WHERE is_active = 1"),
      pool.query("SELECT COUNT(*) AS count FROM analytics_events WHERE event_type = 'page_view'"),
      pool.query(
        `SELECT
          entity_type,
          entity_id,
          path,
          COUNT(*) AS total_views
        FROM analytics_events
        WHERE event_type = 'page_view'
        GROUP BY entity_type, entity_id, path
        ORDER BY total_views DESC, MAX(created_at) DESC
        LIMIT 6`
      ),
      pool.query(
        `SELECT
          placement_key,
          provider,
          page_scope,
          is_active
        FROM ads
        ORDER BY is_active DESC, created_at DESC
        LIMIT 6`
      )
    ]);

    res.json({
      stats: {
        tools: queries[0][0][0].count,
        calculators: queries[1][0][0].count,
        aiTools: queries[2][0][0].count,
        blogs: queries[3][0][0].count,
        users: queries[4][0][0].count,
        pendingComments: queries[5][0][0].count,
        pendingSubmissions: queries[6][0][0].count,
        totalAds: queries[8][0][0].count,
        activeAds: queries[9][0][0].count,
        pageViews: queries[10][0][0].count
      },
      traffic: queries[7][0],
      topPages: queries[11][0],
      adInventory: queries[12][0]
    });
  } catch (error) {
    next(error);
  }
};

export const listUsers = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, email, role, status, last_login_at, created_at FROM users ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

export const createUser = async (req, res, next) => {
  try {
    const { name, email, password, role = "user", status = "active" } = req.body;
    const [existing] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);

    if (existing.length) {
      return res.status(409).json({ message: "Email is already registered." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      "INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)",
      [name, email, passwordHash, role, status]
    );

    const [rows] = await pool.query(
      "SELECT id, name, email, role, status, last_login_at, created_at FROM users WHERE id = ?",
      [result.insertId]
    );

    res.status(201).json({
      message: "User created successfully.",
      user: rows[0]
    });
  } catch (error) {
    next(error);
  }
};

export const updateUserAccess = async (req, res, next) => {
  try {
    const updates = [];
    const values = [];

    if (req.body.role) {
      updates.push("role = ?");
      values.push(req.body.role);
    }

    if (req.body.status) {
      updates.push("status = ?");
      values.push(req.body.status);
    }

    if (!updates.length) {
      return res.status(400).json({ message: "No user access changes provided." });
    }

    values.push(req.params.id);

    await pool.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, values);

    res.json({ message: "User permissions updated." });
  } catch (error) {
    next(error);
  }
};

export const updateSubmissionStatus = async (req, res, next) => {
  try {
    await pool.query(
      "UPDATE tool_submissions SET status = ?, admin_notes = ? WHERE id = ?",
      [req.body.status, req.body.adminNotes || null, req.params.id]
    );
    res.json({ message: "Submission updated." });
  } catch (error) {
    next(error);
  }
};

export const updateCommentStatus = async (req, res, next) => {
  try {
    await pool.query("UPDATE comments SET status = ? WHERE id = ?", [req.body.status, req.params.id]);
    res.json({ message: "Comment updated." });
  } catch (error) {
    next(error);
  }
};

export const getSiteSetting = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT setting_key, setting_value, updated_at FROM site_settings WHERE setting_key = ? LIMIT 1",
      [req.params.key]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Setting not found." });
    }

    res.json({
      ...rows[0],
      setting_value: parseSettingValue(rows[0].setting_value)
    });
  } catch (error) {
    next(error);
  }
};

export const upsertSiteSetting = async (req, res, next) => {
  try {
    await pool.query(
      `INSERT INTO site_settings (setting_key, setting_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [req.params.key, JSON.stringify(req.body)]
    );

    res.json({ message: "Setting saved successfully." });
  } catch (error) {
    next(error);
  }
};
