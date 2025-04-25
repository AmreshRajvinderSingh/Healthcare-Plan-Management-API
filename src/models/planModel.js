const redisClient = require("../config/redisClient");
const rabbitmqClient = require("../config/rabbitmqClient");
const { elasticClient, checkConnection } = require("../config/elasticSearchClient");

// Initialize connections
checkConnection(); // Call the check connection function
rabbitmqClient.initialize(); // Assuming initialize is a function in this module

exports.setPlan = async (id, data, etag) => {
  const payload = JSON.stringify({ data, etag });
  await redisClient.set(id, payload);
};

exports.getPlan = async (id) => {
  const plan = await redisClient.get(id);
  return plan ? JSON.parse(plan) : null;
};

exports.deletePlan = async (id) => {
  await redisClient.del(id);
};
