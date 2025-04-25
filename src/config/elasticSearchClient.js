const { Client } = require('@elastic/elasticsearch');
require("dotenv").config();

const elasticClient = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200'
});

// Test the connection
const checkConnection = async () => {
  try {
    const info = await elasticClient.info();
    console.log('Elasticsearch connection successful');
    console.log(`Elasticsearch cluster: ${info.body.cluster_name}`);
    return true;
  } catch (error) {
    console.error('Elasticsearch connection error:', error);
    return false;
  }
};

// Export both the client and the checkConnection function
module.exports = {
  elasticClient,
  checkConnection
};