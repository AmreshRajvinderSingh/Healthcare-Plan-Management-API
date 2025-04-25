# Healthcare Plan Management API

A RESTful API for managing healthcare plans with complex hierarchical data structures, supporting CRUD operations, advanced query capabilities, and data synchronization between Redis and Elasticsearch.

## Features

- RESTful API with full CRUD operations
- JSON Schema validation for data integrity
- Storage of data in Redis key/value store
- Search functionality with Parent-Child relationships using Elasticsearch
- Message queueing with RabbitMQ for reliable data synchronization
- Advanced semantics including ETags and conditional updates
- Cascaded delete operations that work across storage layers
- OAuth 2.0 authentication

## Architecture

The system uses a multi-tier architecture:

1. **Redis** - Primary key/value store for fast data access
2. **Elasticsearch** - Search engine with parent-child relationship support
3. **RabbitMQ** - Message queue for asynchronous operations
4. **Node.js** - REST API with Express

Data flow:
- REST API operations modify Redis (primary data store)
- Operations are queued in RabbitMQ
- A worker processes these operations and updates Elasticsearch
- Parent-child relationships are maintained in Elasticsearch

## Data Model

The API manages healthcare plans with the following structure:

- **Plan** - The parent entity containing plan information
  - **Plan Cost Shares** - Cost sharing details for the plan
  - **Linked Plan Services** - Collection of services covered by the plan
    - **Linked Service** - Information about a specific healthcare service
    - **Plan Service Cost Shares** - Cost sharing details for a specific service

This hierarchical relationship is preserved in Elasticsearch using parent-child joins, allowing for advanced querying.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/plan` | Create a new plan |
| GET | `/v1/plan/:id` | Retrieve a plan by ID |
| DELETE | `/v1/plan/:id` | Delete a plan and all its children |
| PATCH | `/v1/plan/:id` | Update a plan (add linked services) |
| DELETE | `/v1/plan/:planId/children/:childId` | Delete a specific child element of a plan |

## Advanced Features

### ETags and Conditional Operations

The API supports optimistic concurrency control:
- All responses include an ETag header
- Clients can use If-None-Match for GET requests to receive 304 Not Modified
- Clients can use If-Match for updates to ensure they're modifying the latest version

### Parent-Child Relationships

Elasticsearch supports complex parent-child queries:
- Find all services under a specific plan
- Find plans with specific service characteristics 
- Query cost shares related to specific services

### Cascaded Delete

When a plan is deleted:
- It's removed from Redis
- A message is queued for deletion from Elasticsearch
- The worker deletes the plan and all its children from Elasticsearch

## Setup and Installation

### Prerequisites

- Node.js (v14+)
- Docker and Docker Compose
- Redis (if not using Docker)

### Docker Setup

```bash
# Start all services (Elasticsearch, RabbitMQ, and Kibana)
docker-compose up -d


# Get all plans
```bash
GET /plans/_search
{
  "query": {
    "match_all": {}
  }
}

# Get children of a specific plan
```bash
GET /plans/_search
{
  "query": {
    "has_parent": {
      "parent_type": "plan",
      "query": {
        "term": {
          "_id": "12xvxc345ssdsds-508"
        }
      }
    }
  }
}

# Get Parent of planCostShare with copay greater than or equal to 1
GET /plans/_search
{
  "query": {
    "has_child": {
      "type": "planCostShare",
      "query": {
        "range": {
          "copay": {
            "gte": 1
          }
        }
      }
    }
  }
}

# Get planCostShare of Plan
GET /plans/_search
{
  "query": {
    "bool": {
      "must": [
        {
          "term": {
            "objectType": {
              "value": "membercostshare"
            }
          }
        },
        {
          "has_parent": {
            "parent_type": "plan",
            "query": {
              "term": {
                "_id": "12xvxc345ssdsds-508"
              }
            }
          }
        }
      ]
    }
  }
}