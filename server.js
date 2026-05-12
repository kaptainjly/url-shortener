const express = require("express");
const dotenv = require("dotenv");
const pool = require("./db");
const { nanoid } = require("nanoid");
const redisClient = require("./redisClient");

dotenv.config();

const app = express();

app.use(express.json());

/**
 * Health check
 */
app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      message: "Server running successfully",
      time: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Database connection failed" });
  }
});

/**
 * Create short URL
 */
app.post("/shorten", async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    const shortCode = nanoid(6);

    const query = `
      INSERT INTO urls (original_url, short_code)
      VALUES ($1, $2)
      RETURNING *
    `;

    const result = await pool.query(query, [url, shortCode]);

    return res.json({
      originalUrl: result.rows[0].original_url,
      shortUrl: `http://localhost:3000/${shortCode}`,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * Redirect with Redis cache (fast path)
 */
app.get("/:shortCode", async (req, res) => {
  try {
    const { shortCode } = req.params;

    // 1. Check Redis first
    const cachedUrl = await redisClient.get(shortCode);

    console.log("Redis hit or miss check:", cachedUrl ? "HIT" : "MISS");

    if (cachedUrl) {
      // update clicks (non-blocking)
      pool.query(
        "UPDATE urls SET clicks = clicks + 1 WHERE short_code = $1",
        [shortCode]
      );

      return res.redirect(cachedUrl);
    }

    // 2. Fallback to PostgreSQL
    const result = await pool.query(
      "SELECT original_url FROM urls WHERE short_code = $1",
      [shortCode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "URL not found" });
    }

    const originalUrl = result.rows[0].original_url;

    // 3. Save to Redis
    await redisClient.set(shortCode, originalUrl);

    // 4. Update clicks
    await pool.query(
      "UPDATE urls SET clicks = clicks + 1 WHERE short_code = $1",
      [shortCode]
    );

    return res.redirect(originalUrl);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * Analytics endpoint
 */
app.get("/stats/:shortCode", async (req, res) => {
  try {
    const { shortCode } = req.params;

    const query = `
      SELECT original_url, short_code, clicks, created_at
      FROM urls
      WHERE short_code = $1
    `;

    const result = await pool.query(query, [shortCode]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "URL not found" });
    }

    const data = result.rows[0];

    res.json({
      shortCode: data.short_code,
      originalUrl: data.original_url,
      clicks: data.clicks,
      createdAt: data.created_at,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});