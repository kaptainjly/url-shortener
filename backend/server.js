const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { nanoid } = require("nanoid");

const pool = require("./db");
const redisClient = require("./redisClient");

dotenv.config();

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "https://your-frontend-domain.com" // 🔁 Replace with your actual frontend URL once deployed
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (e.g. mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error(`CORS policy: origin ${origin} not allowed`));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

// ✅ Apply CORS and handle preflight early, before any other middleware
app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // 🔁 Now uses the same options, not a bare cors()

app.use(express.json());


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
 * SHORTEN URL
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
      expiresAt = new Date(Date.now() + expiresInMinutes * 60000);
    }

    const result = await pool.query(
      `INSERT INTO urls (original_url, short_code, expires_at)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [url, shortCode, expiresAt]
    );

    const shortUrl = `${req.protocol}://${req.get("host")}/${shortCode}`;

    res.json({
      originalUrl: result.rows[0].original_url,
      shortUrl,
      expiresAt: result.rows[0].expires_at,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * REDIRECT
 */
app.get("/:shortCode", async (req, res) => {
  try {
    const { shortCode } = req.params;

    const result = await pool.query(
      "SELECT * FROM urls WHERE short_code = $1",
      [shortCode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "URL not found" });
    }

    const data = result.rows[0];

    if (data.expires_at && new Date() > new Date(data.expires_at)) {
      return res.status(410).json({ error: "Link has expired" });
    }

    await pool.query(
      "UPDATE urls SET clicks = clicks + 1 WHERE short_code = $1",
      [shortCode]
    );

    return res.redirect(data.original_url);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * STATS
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