let client = null;

if (process.env.NODE_ENV !== "production") {
  const redis = require("redis");

  client = redis.createClient();

  client.on("error", (err) => {
    console.error("Redis error:", err);
  });

  client.connect();
}

module.exports = client;