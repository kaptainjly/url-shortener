const express = require("express");
const dotenv = require("dotenv");
const { nanoid } = require("nanoid");
const pool = require("../db");
const redisClient = require("../redisClient");
const cors = require("cors");

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());

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
 * CREATE SHORT URL (WITH EXPIRY SUPPORT)
 */
app.post("/shorten", async (req, res) => {
  try {
    const { url, expiresInMinutes } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    const shortCode = nanoid(6);

    let expiresAt = null;

    if (expiresInMinutes) {
      expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
    }

    const query = `
      INSERT INTO urls (original_url, short_code, expires_at)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const result = await pool.query(query, [
      url,
      shortCode,
      expiresAt,
    ]);

    // cache (optional safe usage)
    if (redisClient) {
      try {
        await redisClient.set(shortCode, url);
      } catch (err) {
        console.error("Redis error:", err);
      }
    }

    res.json({
      originalUrl: result.rows[0].original_url,
    shortUrl: `${req.protocol}://${req.get("host")}/${shortCode}`,
      expiresAt: result.rows[0].expires_at,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * REDIRECT WITH CACHE + EXPIRY CHECK
 */
app.get("/:shortCode", async (req, res) => {
  try {
    const { shortCode } = req.params;

    let cachedUrl = null;

    // Redis check (safe fallback)
    if (redisClient) {
      try {
        cachedUrl = await redisClient.get(shortCode);
      } catch (err) {
        console.error("Redis read error:", err);
      }
    }

    const result = await pool.query(
      "SELECT * FROM urls WHERE short_code = $1",
      [shortCode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "URL not found" });
    }

    const data = result.rows[0];

    // EXPIRY CHECK
    if (data.expires_at && new Date() > new Date(data.expires_at)) {
      return res.status(410).json({ error: "Link has expired" });
    }

    // increment clicks
    await pool.query(
      "UPDATE urls SET clicks = clicks + 1 WHERE short_code = $1",
      [shortCode]
    );

    // cache if not already cached
    if (redisClient && !cachedUrl) {
      try {
        await redisClient.set(shortCode, data.original_url);
      } catch (err) {
        console.error("Redis write error:", err);
      }
    }

    return res.redirect(data.original_url);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * ANALYTICS
 */
app.get("/stats/:shortCode", async (req, res) => {
  try {
    const { shortCode } = req.params;

    const result = await pool.query(
      "SELECT * FROM urls WHERE short_code = $1",
      [shortCode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "URL not found" });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});