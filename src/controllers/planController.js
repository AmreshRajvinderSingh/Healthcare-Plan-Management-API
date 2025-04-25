// src/controllers/planController.js
const crypto = require("crypto");
const { validate } = require("jsonschema");
const planSchema = require("../schema/planSchema.json");
const { setPlan, getPlan, deletePlan,deleteChild } = require("../models/planModel");
const rabbitmqService = require("../services/rabbitmq.service");

const generateEtag = (data) => crypto.createHash("md5").update(JSON.stringify(data)).digest("hex");

exports.createPlan = async (req, res) => {
  console.log("Received request to create plan:", req.body);

  const validation = validate(req.body, planSchema);
  if (!validation.valid) {
    console.log("Validation failed:", validation.errors);
    return res.status(400).json({ errors: validation.errors.map((e) => e.stack) });
  }

  const planId = req.body.objectId;
  if (!planId) {
    console.log("Missing objectId in request body");
    return res.status(400).json({ error: "Missing objectId in request body" });
  }

  const existingPlan = await getPlan(planId);
  if (existingPlan) {
    console.log(`Plan with ID ${planId} already exists`);
    return res.status(409).json({ error: "Object already exists" });
  }

  const etag = generateEtag(req.body);
  console.log(`Generated ETag for plan ${planId}:`, etag);

  // Save to Redis
  await setPlan(planId, req.body, etag);
  console.log(`Plan ${planId} successfully saved to Redis`);

  // Queue for Elasticsearch indexing
  await rabbitmqService.queuePlanCreation(req.body);
  console.log(`Plan ${planId} queued for Elasticsearch indexing`);

  res.setHeader("ETag", etag);
  return res.status(201).json({ message: "Object added" });
};

exports.getPlan = async (req, res) => {
  const { id } = req.params;
  console.log(`Received request to fetch plan with ID: ${id}`);

  const plan = await getPlan(id);
  if (!plan) {
    console.log(`Plan with ID ${id} not found`);
    return res.status(404).json({ error: "Plan not found" });
  }

  if (!plan.etag) {
    console.log(`Plan with ID ${id} is missing an ETag`);
    return res.status(500).json({ error: "ETag missing from stored data", data: plan });
  }

  const clientEtag = req.headers["if-none-match"];
  console.log(`Client provided ETag: ${clientEtag}, Stored ETag: ${plan.etag}`);

  if (clientEtag && clientEtag === plan.etag) {
    console.log(`ETag matches for plan ${id}, returning 304`);
    return res.status(304).send(); // No change, return 304
  }

  console.log(`Sending plan ${id} with data:`, plan.data);
  res.setHeader("ETag", plan.etag);
  return res.status(200).json(plan.data);
};

exports.deletePlan = async (req, res) => {
  const { id } = req.params;
  console.log(`Received request to delete plan with ID: ${id}`);

  const plan = await getPlan(id);
  if (!plan) {
    console.log(`Plan with ID ${id} not found`);
    return res.status(404).json({ error: "Plan not found" });
  }

  // Delete from Redis
  await deletePlan(id);
  console.log(`Plan ${id} successfully deleted from Redis`);

  // Queue for Elasticsearch deletion
  await rabbitmqService.queuePlanDeletion(id);
  console.log(`Plan ${id} queued for deletion from Elasticsearch`);

  res.status(204).end();
};

const { merge } = require('lodash');

exports.patchPlan = async (req, res) => {
  const { id } = req.params;
  console.log("Incoming PATCH request body:", req.body);

  if (!Array.isArray(req.body.linkedPlanServices)) {
    console.log("PATCH must include an array of linkedPlanServices");
    return res.status(400).json({ error: "PATCH must include an array of linkedPlanServices" });
  }

  // Retrieve existing plan from Redis
  const existingPlan = await getPlan(id);
  if (!existingPlan) {
    console.log(`Plan with ID ${id} not found`);
    return res.status(404).json({ error: "Plan not found" });
  }

  console.log(`Existing plan data:`, existingPlan);

  // Check ETag for conditional update
  const clientEtag = req.headers["if-match"];
  if (clientEtag && clientEtag !== existingPlan.etag) {
    console.log(`Precondition Failed: Client ETag ${clientEtag} does not match ${existingPlan.etag}`);
    return res.status(412).json({ error: "Precondition Failed" });
  }

  // Clone existing data
  const updatedData = { ...existingPlan.data };

  if (!Array.isArray(updatedData.linkedPlanServices)) {
    updatedData.linkedPlanServices = [];
  }

  const existingObjectIds = new Set(updatedData.linkedPlanServices.map(item => item.objectId));

  req.body.linkedPlanServices.forEach(newItem => {
    if (!existingObjectIds.has(newItem.objectId)) {
      updatedData.linkedPlanServices.push(newItem);
    }
  });


  // Generate new ETag
  const newEtag = generateEtag(updatedData);
  console.log(`New ETag generated: ${newEtag}`);

  // Save updated plan to Redis
  await setPlan(id, updatedData, newEtag);
  console.log(`Updated plan ${id} saved to Redis`);

  // Queue for Elasticsearch update
  await rabbitmqService.queuePlanUpdate(id, updatedData);
  console.log(`Plan ${id} queued for update in Elasticsearch`);

  // Fetch again to confirm the update
  const updatedPlan = await getPlan(id);
  console.log(`Updated plan stored:`, updatedPlan);

  // Set new ETag in response
  res.setHeader("ETag", newEtag);
  return res.status(200).json(updatedData);
};

const elasticsearchService = require("../services/elastic.service");
exports.deleteChild = async (req, res) => {
  const { planId, childId } = req.params;
  console.log(`Received request to delete child ${childId} of plan ${planId}`);

  try {
    // First, get the plan from Redis
    const plan = await getPlan(planId);
    if (!plan) {
      console.log(`Plan with ID ${planId} not found`);
      return res.status(404).json({ error: "Plan not found" });
    }

    // Clone the plan data
    const updatedData = { ...plan.data };
    let childFound = false;

    // Check if the child is the planCostShares
    if (updatedData.planCostShares && updatedData.planCostShares.objectId === childId) {
      console.log(`Found child ${childId} as planCostShares`);
      childFound = true;
      updatedData.planCostShares = null; // Or provide a default/empty structure
    }

    // Check if the child is in linkedPlanServices
    if (updatedData.linkedPlanServices && Array.isArray(updatedData.linkedPlanServices)) {
      // Check for direct service matches
      const initialLength = updatedData.linkedPlanServices.length;
      updatedData.linkedPlanServices = updatedData.linkedPlanServices.filter(
        service => service.objectId !== childId
      );
      
      // Check if any linkedPlanServices were removed
      if (initialLength > updatedData.linkedPlanServices.length) {
        childFound = true;
      } else {
        // Check for nested objects
        updatedData.linkedPlanServices = updatedData.linkedPlanServices.map(service => {
          // Check linked service
          if (service.linkedService && service.linkedService.objectId === childId) {
            childFound = true;
            return { ...service, linkedService: null };
          }
          
          // Check plan service cost shares
          if (service.planserviceCostShares && service.planserviceCostShares.objectId === childId) {
            childFound = true;
            return { ...service, planserviceCostShares: null };
          }
          
          return service;
        });
      }
    }

    if (!childFound) {
      console.log(`Child ${childId} not found in plan ${planId}`);
      return res.status(404).json({ error: "Child not found in plan" });
    }

    // Generate new ETag
    const newEtag = generateEtag(updatedData);
    
    // Save updated plan back to Redis
    await setPlan(planId, updatedData, newEtag);
    console.log(`Updated plan ${planId} saved to Redis after removing child ${childId}`);

    // Queue for Elasticsearch update
    await rabbitmqService.queuePlanUpdate(planId, updatedData);
    console.log(`Plan ${planId} queued for update in Elasticsearch after removing child ${childId}`);

    // Also delete specifically from Elasticsearch
    await elasticsearchService.deleteChild(childId, planId);
    
    // Return success response
    return res.status(204).end();
  } catch (error) {
    console.error(`Error deleting child ${childId}:`, error);
    return res.status(500).json({ error: 'Error deleting child' });
  }
};