const redis = require("redis");
require("dotenv").config();

const redisClient = redis.createClient({
  socket: {
    host: "127.0.0.1",
    port: 6379,
  },
});

redisClient.connect().catch(console.error);

redisClient.on("error", (err) => {
  console.error("Redis error:", err);
});

module.exports = redisClient;
