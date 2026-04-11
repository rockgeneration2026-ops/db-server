import slugify from "slugify";
import { pool } from "../config/db.js";
import { buildPagination, listResponse, normalizeSort } from "../utils/query.js";
import { createMeta } from "../utils/seo.js";

const tableMap = {
  tools: { table: "tools", singular: "tool", allowedSorts: ["created_at", "name"] },
  calculators: { table: "calculators", singular: "calculator", allowedSorts: ["created_at", "name"] },
  "ai-tools": { table: "ai_tools", singular: "ai tool", allowedSorts: ["created_at", "name", "rating"] },
  blogs: { table: "blogs", singular: "blog", allowedSorts: ["published_at", "created_at", "title"] },
  ads: { table: "ads", singular: "ad", allowedSorts: ["created_at", "name"] }
};

const searchableColumns = {
  tools: ["t.name", "t.short_description"],
  calculators: ["t.name", "t.short_description"],
  "ai-tools": ["t.name", "t.description"],
  blogs: ["t.title", "t.excerpt"],
  ads: ["t.name", "t.page_scope"]
};

const fieldMap = {
  tools: "t.id, t.name, t.slug, t.short_description, t.description, t.content, t.image_url, t.external_url, t.tool_type, t.featured, t.sponsored, t.status, t.meta_title, t.meta_description, t.seo_keywords, c.name AS category_name, c.slug AS category_slug",
  calculators: "t.id, t.name, t.slug, t.short_description, t.description, t.formula_text, t.featured, t.status, t.meta_title, t.meta_description, t.seo_keywords, c.name AS category_name, c.slug AS category_slug",
  "ai-tools": "t.id, t.name, t.slug, t.description, t.features, t.pricing, t.external_url, t.rating, t.screenshots, t.tags, t.featured, t.sponsored, t.status, t.meta_title, t.meta_description, t.seo_keywords, c.name AS category_name, c.slug AS category_slug",
  blogs: "t.id, t.title, t.slug, t.excerpt, t.content, t.featured_image, t.seo_title, t.seo_description, t.seo_keywords, t.featured, t.status, t.published_at, c.name AS category_name, c.slug AS category_slug, u.name AS author_name",
  ads: "t.id, t.name, t.slug, t.provider, t.ad_type, t.placement_key, t.page_scope, t.html_code, t.image_source, t.image_url, t.target_url, t.is_active, t.starts_at, t.ends_at"
};

const joins = {
  tools: "LEFT JOIN categories c ON c.id = t.category_id",
  calculators: "LEFT JOIN categories c ON c.id = t.category_id",
  "ai-tools": "LEFT JOIN categories c ON c.id = t.category_id",
  blogs: "LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN users u ON u.id = t.author_id",
  ads: ""
};

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

const resolvePublicServerOrigin = (req) => {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || req.protocol || "http").split(",")[0].trim();
  const host = req.headers["x-forwarded-host"] || req.get("host");

  if (host) {
    return `${proto}://${host}`;
  }

  const baseUrl = process.env.APP_URL || "http://localhost:5173";
  return baseUrl.replace(/\/$/, "").replace(":5173", `:${process.env.PORT || 5000}`);
};

const canViewHidden = (req) =>
  ["admin", "editor"].includes(req.user?.role) && req.query.includeHidden === "true";

const activeAdClause = "t.is_active = 1 AND (t.starts_at IS NULL OR t.starts_at <= NOW()) AND (t.ends_at IS NULL OR t.ends_at >= NOW())";

const visibleClause = (resource, adminMode) => {
  if (resource === "ads") {
    return adminMode ? "1=1" : activeAdClause;
  }
  return adminMode ? "1=1" : "t.status = 'published'";
};

export const listContent = (resource) => async (req, res, next) => {
  try {
    const config = tableMap[resource];
    const { page, limit, offset } = buildPagination(req.query);
    const { sortBy, order } = normalizeSort(req.query, config.allowedSorts);
    const adminMode = canViewHidden(req);
    const params = [];
    const filters = [visibleClause(resource, adminMode)];

    if (req.query.search) {
      const like = `%${req.query.search}%`;
      filters.push(`(${searchableColumns[resource].map((col) => `${col} LIKE ?`).join(" OR ")})`);
      searchableColumns[resource].forEach(() => params.push(like));
    }

    if (req.query.category && resource !== "ads") {
      filters.push("c.slug = ?");
      params.push(req.query.category);
    }

    if (resource === "tools" && req.query.toolType) {
      filters.push("t.tool_type = ?");
      params.push(req.query.toolType);
    }

    if (resource === "ai-tools" && req.query.pricing) {
      filters.push("t.pricing = ?");
      params.push(req.query.pricing);
    }

    if (resource === "ai-tools" && req.query.rating) {
      filters.push("t.rating >= ?");
      params.push(Number(req.query.rating));
    }

    const latestOnlyAds = resource === "ads" && (req.query.latestOnly === "true" || !adminMode);
    if (latestOnlyAds) {
      // Use latest ad per placement/scope to keep admin and client behavior aligned.
      filters.push(
        `t.id IN (
          SELECT latest.id
          FROM ads latest
          INNER JOIN (
            SELECT placement_key, page_scope, MAX(id) AS max_id
            FROM ads
            GROUP BY placement_key, page_scope
          ) grouped ON grouped.max_id = latest.id
        )`
      );
    }

    if (resource === "ads" && req.query.pageScope) {
      const scopes = String(req.query.pageScope)
        .split(",")
        .map((scope) => scope.trim())
        .filter(Boolean);

      if (scopes.length) {
        filters.push(`t.page_scope IN (${scopes.map(() => "?").join(", ")})`);
        params.push(...scopes);
      }
    }

    if (resource === "ads" && req.query.placementKey) {
      filters.push("t.placement_key = ?");
      params.push(req.query.placementKey);
    }

    const where = `WHERE ${filters.join(" AND ")}`;
    if (resource === "ads" && !adminMode) {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    }
    const [rows] = await pool.query(
      `SELECT ${fieldMap[resource]} FROM ${config.table} t ${joins[resource]} ${where} ORDER BY t.${sortBy} ${order} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM ${config.table} t ${joins[resource]} ${where}`,
      params
    );

    res.json(listResponse(rows, countRows[0].total, page, limit));
  } catch (error) {
    next(error);
  }
};

export const getContentBySlug = (resource) => async (req, res, next) => {
  try {
    const config = tableMap[resource];
    const [rows] = await pool.query(
      `SELECT ${fieldMap[resource]} FROM ${config.table} t ${joins[resource]} WHERE t.slug = ? LIMIT 1`,
      [req.params.slug]
    );

    if (!rows.length) {
      return res.status(404).json({ message: `${config.singular} not found.` });
    }

    const entity = rows[0];
    const adminMode = canViewHidden(req);

    if (resource === "ads") {
      if (!adminMode && !entity.is_active) {
        return res.status(404).json({ message: `${config.singular} not found.` });
      }
    } else if (!adminMode && entity.status !== "published") {
      return res.status(404).json({ message: `${config.singular} not found.` });
    }

    const title = entity.meta_title || entity.seo_title || entity.name || entity.title;
    const description = entity.meta_description || entity.seo_description || entity.short_description || entity.excerpt || entity.description;

    res.json({
      item: entity,
      seo: createMeta(title, description, req.originalUrl)
    });
  } catch (error) {
    next(error);
  }
};

export const createContent = (resource) => async (req, res, next) => {
  try {
    const table = tableMap[resource].table;
    const payload = { ...req.body };

    if (!payload.slug) {
      payload.slug = slugify(payload.name || payload.title || "item", { lower: true, strict: true });
    }

    const columns = Object.keys(payload);
    const [result] = await pool.query(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
      Object.values(payload)
    );

    res.status(201).json({ id: result.insertId, message: `${resource} created.` });
  } catch (error) {
    next(error);
  }
};

const createUniqueSlug = async (table, sourceValue) => {
  const baseSlug = slugify(sourceValue || "item", { lower: true, strict: true }) || "item";
  let slug = baseSlug;
  let suffix = 2;

  while (true) {
    const [existing] = await pool.query(`SELECT id FROM ${table} WHERE slug = ? LIMIT 1`, [slug]);
    if (!existing.length) {
      return slug;
    }
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
};

export const submitUserBlog = async (req, res, next) => {
  try {
    const title = req.body.title?.trim();
    const excerpt = req.body.excerpt?.trim();
    const content = req.body.content?.trim();

    if (!title || !excerpt || !content) {
      return res.status(400).json({ message: "Title, excerpt, and content are required." });
    }

    const slug = await createUniqueSlug("blogs", title);
    const status = "published";
    const featuredImage = req.body.featured_image?.trim() || null;
    const seoTitle = req.body.seo_title?.trim() || title;
    const seoDescription = req.body.seo_description?.trim() || excerpt;
    const categoryId = req.body.category_id ? Number(req.body.category_id) : null;

    const [result] = await pool.query(
      `INSERT INTO blogs
      (category_id, author_id, title, slug, excerpt, content, featured_image, seo_title, seo_description, status, featured, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())`,
      [categoryId, req.user.id, title, slug, excerpt, content, featuredImage, seoTitle, seoDescription, status]
    );

    res.status(201).json({
      id: result.insertId,
      slug,
      message: "Blog published successfully."
    });
  } catch (error) {
    next(error);
  }
};

export const updateContent = (resource) => async (req, res, next) => {
  try {
    const table = tableMap[resource].table;
    const columns = Object.keys(req.body);
    if (!columns.length) {
      return res.status(400).json({ message: "No update payload provided." });
    }

    await pool.query(
      `UPDATE ${table} SET ${columns.map((column) => `${column} = ?`).join(", ")} WHERE id = ?`,
      [...Object.values(req.body), req.params.id]
    );
    res.json({ message: `${resource} updated.` });
  } catch (error) {
    next(error);
  }
};

export const deleteContent = (resource) => async (req, res, next) => {
  try {
    const table = tableMap[resource].table;
    await pool.query(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
    res.json({ message: `${resource} deleted.` });
  } catch (error) {
    next(error);
  }
};

export const getHomepage = async (req, res, next) => {
  try {
    const [heroRows] = await pool.query(
      "SELECT setting_value FROM site_settings WHERE setting_key = 'homepage_hero' LIMIT 1"
    );
    const [popularTools] = await pool.query(
      "SELECT id, name, slug, short_description, tool_type, featured FROM tools WHERE status = 'published' ORDER BY featured DESC, created_at DESC LIMIT 4"
    );
    const [popularCalculators] = await pool.query(
      "SELECT id, name, slug, short_description, featured FROM calculators WHERE status = 'published' ORDER BY featured DESC, created_at DESC LIMIT 4"
    );
    const [trendingAi] = await pool.query(
      "SELECT id, name, slug, description, pricing, rating, featured FROM ai_tools WHERE status = 'published' ORDER BY featured DESC, rating DESC LIMIT 4"
    );
    const [latestBlogs] = await pool.query(
      "SELECT id, title, slug, excerpt, featured_image, published_at, featured FROM blogs WHERE status = 'published' ORDER BY published_at DESC LIMIT 4"
    );
    const [mostViewedTools] = await pool.query(
      `SELECT
        t.id,
        t.name,
        t.slug,
        t.short_description,
        t.tool_type,
        t.featured,
        COUNT(ae.id) AS view_count
      FROM tools t
      LEFT JOIN analytics_events ae
        ON ae.entity_type = 'tool'
        AND ae.entity_id = t.id
        AND ae.event_type = 'page_view'
      WHERE t.status = 'published'
      GROUP BY t.id, t.name, t.slug, t.short_description, t.tool_type, t.featured
      ORDER BY view_count DESC, t.featured DESC, t.created_at DESC
      LIMIT 4`
    );
    const [mostViewedBlogs] = await pool.query(
      `SELECT
        b.id,
        b.title,
        b.slug,
        b.excerpt,
        b.featured_image,
        b.published_at,
        COUNT(ae.id) AS view_count
      FROM blogs b
      LEFT JOIN analytics_events ae
        ON ae.entity_type = 'blog'
        AND ae.entity_id = b.id
        AND ae.event_type = 'page_view'
      WHERE b.status = 'published'
      GROUP BY b.id, b.title, b.slug, b.excerpt, b.featured_image, b.published_at
      ORDER BY view_count DESC, b.published_at DESC
      LIMIT 4`
    );
    const [ads] = await pool.query(
      `SELECT a.name, a.slug, a.placement_key, a.html_code, a.provider, a.target_url, a.is_active, a.starts_at, a.ends_at
       FROM ads a
       INNER JOIN (
         SELECT placement_key, page_scope, MAX(id) AS max_id
         FROM ads
         GROUP BY placement_key, page_scope
       ) latest ON latest.max_id = a.id
       WHERE a.is_active = 1
         AND (a.starts_at IS NULL OR a.starts_at <= NOW())
         AND (a.ends_at IS NULL OR a.ends_at >= NOW())
         AND a.page_scope IN ('home', 'global')
       ORDER BY a.placement_key ASC`
    );
    res.json({
      hero: parseJsonValue(heroRows[0]?.setting_value),
      popularTools,
      popularCalculators,
      trendingAi,
      latestBlogs,
      mostViewedTools,
      mostViewedBlogs,
      ads
    });
  } catch (error) {
    next(error);
  }
};

export const listCategories = async (req, res, next) => {
  try {
    const params = [];
    let sql = "SELECT id, name, slug, type, description, seo_title, seo_description FROM categories";
    if (req.query.type) {
      sql += " WHERE type = ?";
      params.push(req.query.type);
    }
    sql += " ORDER BY name ASC";
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

export const createComment = async (req, res, next) => {
  try {
    const { blogId, authorName, authorEmail, body } = req.body;
    await pool.query(
      "INSERT INTO comments (blog_id, user_id, author_name, author_email, body, status) VALUES (?, ?, ?, ?, ?, 'pending')",
      [blogId, req.user?.id || null, authorName, authorEmail, body]
    );
    res.status(201).json({ message: "Comment submitted for review." });
  } catch (error) {
    next(error);
  }
};

export const listComments = async (req, res, next) => {
  try {
    const adminMode = Boolean(req.user?.role);
    const params = [];
    let sql = "SELECT c.id, c.blog_id, c.author_name, c.author_email, c.body, c.status, c.created_at, b.title AS blog_title FROM comments c LEFT JOIN blogs b ON b.id = c.blog_id";
    if (req.query.blogId) {
      sql += " WHERE c.blog_id = ?";
      params.push(req.query.blogId);
      if (!adminMode) {
        sql += " AND c.status = 'approved'";
      }
    } else if (!adminMode) {
      sql += " WHERE c.status = 'approved'";
    }
    sql += " ORDER BY c.created_at DESC";
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

export const createSubmission = async (req, res, next) => {
  try {
    const payload = {
      submitted_by: req.user?.id || null,
      name: req.body.name,
      slug: slugify(req.body.name, { lower: true, strict: true }),
      category_name: req.body.categoryName,
      description: req.body.description,
      features: JSON.stringify(req.body.features || []),
      pricing: req.body.pricing,
      external_url: req.body.externalUrl,
      screenshots: JSON.stringify(req.body.screenshots || []),
      tags: JSON.stringify(req.body.tags || [])
    };
    await pool.query(
      "INSERT INTO tool_submissions (submitted_by, name, slug, category_name, description, features, pricing, external_url, screenshots, tags, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')",
      Object.values(payload)
    );
    res.status(201).json({ message: "Submission received." });
  } catch (error) {
    next(error);
  }
};

export const listSubmissions = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, slug, category_name, description, pricing, external_url, status, admin_notes, created_at FROM tool_submissions ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

export const trackAnalytics = async (req, res, next) => {
  try {
    await pool.query(
      "INSERT INTO analytics_events (user_id, event_type, entity_type, entity_id, path, referrer, payload, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        req.user?.id || null,
        req.body.eventType,
        req.body.entityType || null,
        req.body.entityId || null,
        req.body.path,
        req.body.referrer || null,
        JSON.stringify(req.body.payload || {}),
        req.ip
      ]
    );
    res.status(201).json({ message: "Event tracked." });
  } catch (error) {
    next(error);
  }
};

export const uploadEditorImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Image file is required." });
    }

    const origin = resolvePublicServerOrigin(req);
    const fileUrl = `${origin}/uploads/blogs/${req.file.filename}`;

    res.status(201).json({
      message: "Image uploaded successfully.",
      file: {
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size
      }
    });
  } catch (error) {
    next(error);
  }
};

export const uploadAdImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Image file is required." });
    }

    const origin = resolvePublicServerOrigin(req);
    const fileUrl = `${origin}/uploads/ads/${req.file.filename}`;

    return res.status(201).json({
      message: "Ad image uploaded successfully.",
      file: {
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getPublicSetting = async (req, res, next) => {
  try {
    const allowedKeys = new Set([
      "page_seo_home",
      "page_seo_tools",
      "page_seo_calculators",
      "page_seo_ai_tools",
      "page_seo_blog",
      "page_seo_cyber_tools",
      "homepage_hero",
      "footer_settings",
      "static_page_about",
      "static_page_contact",
      "static_page_privacy_policy",
      "static_page_terms",
      "static_page_sitemap"
    ]);

    if (!allowedKeys.has(req.params.key)) {
      return res.status(404).json({ message: "Setting not found." });
    }

    const [rows] = await pool.query(
      "SELECT setting_key, setting_value, updated_at FROM site_settings WHERE setting_key = ? LIMIT 1",
      [req.params.key]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Setting not found." });
    }

    res.json({
      ...rows[0],
      setting_value: parseJsonValue(rows[0].setting_value)
    });
  } catch (error) {
    next(error);
  }
};
