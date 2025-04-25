// src/services/elastic.service.js
const { elasticClient } = require('../config/elasticSearchClient');

// Index name
const PLAN_INDEX = process.env.ELASTICSEARCH_INDEX || 'plans';

// Initialize Elasticsearch index
const initializeIndices = async () => {
  try {
    console.log("Checking if index exists...");
    
    // First try to delete the index if it exists
    try {
      await elasticClient.indices.delete({ index: PLAN_INDEX });
      console.log(`Successfully deleted existing index ${PLAN_INDEX}`);
    } catch (deleteError) {
      // It's okay if the index doesn't exist yet
      if (deleteError.meta && deleteError.meta.statusCode !== 404) {
        console.error("Error deleting index:", deleteError);
      } else {
        console.log("Index didn't exist, no need to delete");
      }
    }
    
    // Create a small delay to ensure deletion is processed
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Now create the index with proper mappings
    await elasticClient.indices.create({
      index: PLAN_INDEX,
      body: {
        mappings: {
          properties: {
            objectId: { type: 'keyword' },
            objectType: { type: 'keyword' },
            planType: { type: 'keyword' },
            _org: { type: 'keyword' },
            name: { type: 'text' },
            creationDate: { type: 'date', format: 'MM-dd-yyyy||yyyy-MM-dd' },
            deductible: { type: 'integer' },
            copay: { type: 'integer' },
            join_field: {
              type: 'join',
              relations: {
                plan: ['planCostShare', 'linkedPlanService'],
                linkedPlanService: ['membercostshare', 'service']
              }
            }
          }
        }
      }
    });
    
    console.log(`Successfully created ${PLAN_INDEX} index with parent-child mappings`);
    return true;
  } catch (error) {
    console.error('Error initializing Elasticsearch index:', error);
    return false;
  }
};

// Index a plan with its children
const indexPlan = async (plan) => {
  try {
    console.log('Indexing plan:', JSON.stringify(plan, null, 2));
    console.log('Plan has', plan.linkedPlanServices ? plan.linkedPlanServices.length : 0, 'linked services');
    const operations = [];
    
    // Index the plan as a parent document using the full objectId
    operations.push({
      index: {
        _index: PLAN_INDEX,
        _id: plan.objectId,
        routing: plan.objectId
      }
    });
    
    operations.push({
      objectId: plan.objectId,
      objectType: plan.objectType,
      planType: plan.planType,
      creationDate: plan.creationDate,
      _org: plan._org,
      join_field: "plan" // String for parent
    });
    
    // Index planCostShares as a child document
    operations.push({
      index: {
        _index: PLAN_INDEX,
        _id: plan.planCostShares.objectId,
        routing: plan.objectId
      }
    });
    
    operations.push({
      objectId: plan.planCostShares.objectId,
      objectType: plan.planCostShares.objectType,
      deductible: plan.planCostShares.deductible,
      copay: plan.planCostShares.copay,
      _org: plan.planCostShares._org,
      join_field: {
        name: "planCostShare",
        parent: plan.objectId
      }
    });
    
    // Index linkedPlanServices and their children
    if (plan.linkedPlanServices && Array.isArray(plan.linkedPlanServices)) {
      plan.linkedPlanServices.forEach(service => {
        // Index the linkedPlanService as a child of plan
        operations.push({
          index: {
            _index: PLAN_INDEX,
            _id: service.objectId,
            routing: plan.objectId
          }
        });
        
        operations.push({
          objectId: service.objectId,
          objectType: service.objectType,
          _org: service._org,
          join_field: {
            name: "linkedPlanService",
            parent: plan.objectId
          }
        });
        
        // Index linkedService as a child of linkedPlanService
        operations.push({
          index: {
            _index: PLAN_INDEX,
            _id: service.linkedService.objectId,
            routing: plan.objectId
          }
        });
        
        operations.push({
          objectId: service.linkedService.objectId,
          objectType: service.linkedService.objectType,
          name: service.linkedService.name,
          _org: service.linkedService._org,
          join_field: {
            name: "service",
            parent: service.objectId
          }
        });
        
        // Index planserviceCostShares as a child of linkedPlanService
        operations.push({
          index: {
            _index: PLAN_INDEX,
            _id: service.planserviceCostShares.objectId,
            routing: plan.objectId
          }
        });
        
        operations.push({
          objectId: service.planserviceCostShares.objectId,
          objectType: service.planserviceCostShares.objectType,
          deductible: service.planserviceCostShares.deductible,
          copay: service.planserviceCostShares.copay,
          _org: service.planserviceCostShares._org,
          join_field: {
            name: "membercostshare",
            parent: service.objectId
          }
        });
      });
    }

    // Execute bulk operation
    const response = await elasticClient.bulk({
      refresh: true,
      body: operations
    });
    
    // Add debugging to see the structure
    console.log('Response structure:', JSON.stringify(response, null, 2));
    
    // Safely check for errors in different possible response formats
    if (response) {
      if (response.body && response.body.errors) {
        console.error('Errors during bulk indexing:', response.body.items);
        return false;
      } else if (response.errors) {
        console.error('Errors during bulk indexing:', response.items);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error indexing plan:', error);
    throw error;
  }
};

// Update a plan
const updatePlan = async (planId, plan) => {
  try {
    // Delete existing plan and all its children
    await deletePlan(planId);
    
    // Re-index the updated plan
    return await indexPlan(plan);
  } catch (error) {
    console.error('Error updating plan:', error);
    throw error;
  }
};

// Delete a plan and all its children
const deletePlan = async (planId) => {
  try {
    // The correct way to specify routing in a deleteByQuery call
    const response = await elasticClient.deleteByQuery({
      index: PLAN_INDEX,
      routing: planId, // Use the full planId for routing
      body: {
        query: {
          match_all: {}
        }
      },
      refresh: true
    });
    
    console.log(`Deleted plan ${planId} and all its children from Elasticsearch`);
    return response;
  } catch (error) {
    console.error('Error deleting plan:', error);
    throw error;
  }
};

// Delete a specific child document
const deleteChild = async (childId, planId) => {
  try {
    // Delete the specific child document
    const response = await elasticClient.delete({
      index: PLAN_INDEX,
      id: childId,
      routing: planId, // Need the parent ID for routing
      refresh: true
    });
    
    console.log(`Successfully deleted child ${childId} from Elasticsearch`);
    return response;
  } catch (error) {
    console.error(`Error deleting child ${childId}:`, error);
    throw error;
  }
};

// Search for plans
const searchPlans = async (query) => {
  try {
    const result = await elasticClient.search({
      index: PLAN_INDEX,
      body: {
        query: query
      }
    });
    
    // Safely access hits
    if (result && result.body && result.body.hits && result.body.hits.hits) {
      return result.body.hits.hits.map(hit => hit._source);
    } else if (result && result.hits && result.hits.hits) {
      return result.hits.hits.map(hit => hit._source);
    }
    
    return [];
  } catch (error) {
    console.error('Error searching plans:', error);
    throw error;
  }
};

module.exports = {
  initializeIndices,
  indexPlan,
  updatePlan,
  deletePlan,
  searchPlans,
  deleteChild
};