// src/workers/elasticsearchWorker.js
require('dotenv').config();
const rabbitmqClient = require('../config/rabbitmqClient');
const elasticsearchService = require('../services/elastic.service');

// Process plan creation messages
const processPlanCreation = async (msg, channel) => {
  try {
    const content = JSON.parse(msg.content.toString());
    console.log(`Processing plan creation for plan ${content.planId}`);
    
    await elasticsearchService.indexPlan(content.plan);
    
    channel.ack(msg);
    console.log(`Successfully indexed plan ${content.planId}`);
  } catch (error) {
    console.error('Error processing plan creation message:', error);
    // Requeue the message if it's a temporary error
    channel.nack(msg, false, true);
  }
};

// Process plan update messages
const processPlanUpdate = async (msg, channel) => {
  try {
    const content = JSON.parse(msg.content.toString());
    console.log(`Processing plan update for plan ${content.planId}`);
    
    // Call only the updatePlan method which handles the full update
    await elasticsearchService.updatePlan(content.planId, content.plan);
    
    channel.ack(msg);
    console.log(`Successfully updated plan ${content.planId} in Elasticsearch`);
  } catch (error) {
    console.error('Error processing plan update message:', error);
    channel.nack(msg, false, true);
  }
};

// Process plan deletion messages
const processPlanDeletion = async (msg, channel) => {
  try {
    const content = JSON.parse(msg.content.toString());
    console.log(`Processing plan deletion for plan ${content.planId}`);
    
    await elasticsearchService.deletePlan(content.planId);
    
    channel.ack(msg);
    console.log(`Successfully deleted plan ${content.planId} from Elasticsearch`);
  } catch (error) {
    console.error('Error processing plan deletion message:', error);
    channel.nack(msg, false, true);
  }
};

// Start the worker
const startWorker = async () => {
  try {
    console.log('Starting Elasticsearch worker...');
    
    // Initialize Elasticsearch indices
    await elasticsearchService.initializeIndices();
    
    // Get channel from client
    const channel = await rabbitmqClient.getChannel();
    
    // Set prefetch to 1 to balance workload
    channel.prefetch(1);
    
    // Consume messages from queues
    channel.consume('plan.create', msg => {
      if (msg !== null) {
        processPlanCreation(msg, channel);
      }
    });
    
    channel.consume('plan.update', msg => {
      if (msg !== null) {
        processPlanUpdate(msg, channel);
      }
    });
    
    channel.consume('plan.delete', msg => {
      if (msg !== null) {
        processPlanDeletion(msg, channel);
      }
    });
    
    console.log('Elasticsearch worker started successfully. Waiting for messages...');
    
  } catch (error) {
    console.error('Error starting worker:', error);
    console.log('Retrying in 5 seconds...');
    setTimeout(startWorker, 5000);
  }
};

// Start the worker
startWorker();