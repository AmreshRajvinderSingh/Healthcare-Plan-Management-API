const amqp = require('amqplib');
require("dotenv").config();

// Connection variables
let connection = null;
let channel = null;

// Queue names
const PLAN_CREATE_QUEUE = 'plan.create';
const PLAN_UPDATE_QUEUE = 'plan.update';
const PLAN_DELETE_QUEUE = 'plan.delete';

// Initialize connection
const initialize = async () => {
  try {
    const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://admin:adminpassword@localhost:5672';
    connection = await amqp.connect(rabbitUrl);
    channel = await connection.createChannel();
    
    // Create queues
    await channel.assertQueue(PLAN_CREATE_QUEUE, { durable: true });
    await channel.assertQueue(PLAN_UPDATE_QUEUE, { durable: true });
    await channel.assertQueue(PLAN_DELETE_QUEUE, { durable: true });
    
    console.log('RabbitMQ connection successful');
    
    // Handle connection close
    connection.on('close', () => {
      console.log('RabbitMQ connection closed. Trying to reconnect...');
      setTimeout(initialize, 5000);
    });
    
    return channel;
  } catch (error) {
    console.error('RabbitMQ connection error:', error);
    console.log('Trying to reconnect to RabbitMQ...');
    setTimeout(initialize, 5000);
  }
};

// Initialize connection immediately
initialize();

// Get channel (will wait for initialization if necessary)
const getChannel = async () => {
  if (!channel) {
    await initialize();
  }
  return channel;
};

// Send message to queue
const sendToQueue = async (queueName, message) => {
  try {
    const ch = await getChannel();
    return ch.sendToQueue(
      queueName, 
      Buffer.from(JSON.stringify(message)), 
      { persistent: true }
    );
  } catch (error) {
    console.error(`Error sending message to queue ${queueName}:`, error);
    throw error;
  }
};

// Close connection
const closeConnection = async () => {
  if (channel) {
    await channel.close();
  }
  if (connection) {
    await connection.close();
  }
};

module.exports = {
    initialize,
  getChannel,
  sendToQueue,
  closeConnection,
  queues: {
    PLAN_CREATE_QUEUE,
    PLAN_UPDATE_QUEUE,
    PLAN_DELETE_QUEUE
  }
};