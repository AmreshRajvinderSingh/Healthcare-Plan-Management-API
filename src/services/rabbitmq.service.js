// src/services/rabbitmqService.js
const rabbitmqClient = require('../config/rabbitmqClient');

// Queue message for plan creation
const queuePlanCreation = async (plan) => {
  try {
    // Get the channel
    const channel = await rabbitmqClient.getChannel();
    
    // Send message to creation queue
    await channel.sendToQueue(
      'plan.create', 
      Buffer.from(JSON.stringify({
        action: 'create',
        planId: plan.objectId,
        plan: plan,
        timestamp: new Date().toISOString()
      })),
      { persistent: true }
    );
    
    console.log(`Queued plan ${plan.objectId} for creation in Elasticsearch`);
    return true;
  } catch (error) {
    console.error(`Error queueing plan creation: ${error.message}`);
    return false;
  }
};

// Queue message for plan update
const queuePlanUpdate = async (planId, plan) => {
  try {
    // Get the channel
    const channel = await rabbitmqClient.getChannel();
    
    // Send message to update queue
    await channel.sendToQueue(
      'plan.update', 
      Buffer.from(JSON.stringify({
        action: 'update',
        planId: planId,
        plan: plan,
        timestamp: new Date().toISOString()
      })),
      { persistent: true }
    );
    
    console.log(`Queued plan ${planId} for update in Elasticsearch`);
    return true;
  } catch (error) {
    console.error(`Error queueing plan update: ${error.message}`);
    return false;
  }
};

// Queue message for plan deletion
const queuePlanDeletion = async (planId) => {
  try {
    // Get the channel
    const channel = await rabbitmqClient.getChannel();
    console.log("trying to send delete to worker");
    // Send message to deletion queue
    await channel.sendToQueue(
      'plan.delete', 
      Buffer.from(JSON.stringify({
        action: 'delete',
        planId: planId,
        timestamp: new Date().toISOString()
      })),
      { persistent: true }
    );
    
    console.log(`Queued plan ${planId} for deletion from Elasticsearch`);
    return true;
  } catch (error) {
    console.error(`Error queueing plan deletion: ${error.message}`);
    return false;
  }
};

module.exports = {
  queuePlanCreation,
  queuePlanUpdate,
  queuePlanDeletion
};