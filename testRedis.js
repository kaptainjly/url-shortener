const redis = require("redis");

async function test() {
  const client = redis.createClient();

  client.on("error", (err) => console.log("Redis Error:", err));

  await client.connect();

  await client.set("test_key", "working");
  const value = await client.get("test_key");

  console.log("Redis value:", value);

  await client.disconnect();
}

test();