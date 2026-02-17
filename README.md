# Airport Ride Pooling System

A scalable, event-driven backend system for smart airport ride pooling with geospatial matching, concurrency handling, and real-time driver assignment.

---

## **BACKEND ENGINEER ASSIGNMENT**
### **Problem Statement**
Build a Smart Airport Ride Pooling Backend System that groups passengers into shared cabs while optimizing routes and pricing.

---

## Table of Contents

- [Assignment Deliverables](#backend-engineer-assignment---deliverables)
- [System Overview](#system-overview)
- [Architecture](#architecture)
- [Algorithms & Data Structures](#algorithms--data-structures)
- [Assumptions & Design Decisions](#assumptions--design-decisions)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup Instructions](#setup-instructions)
- [API Documentation](#api-documentation)
- [How It Works](#how-it-works)
- [Database Schema](#database-schema)
- [Pricing Formula](#pricing-formula)
- [Detour Algorithm Explained](#detour-algorithm-explained)
- [Testing](#testing)
- [Development Scripts](#development-scripts)
- [Technical Implementation Details](#technical-implementation-details)
- [Complexity Analysis Summary](#complexity-analysis-summary)
- [License](#license)

## System Overview

This system groups passengers into shared airport rides while optimizing routes and pricing. It supports both airport-to-city and city-to-airport directions with automatic driver assignment.

## Architecture

### High-Level Design
```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Client    │────▶│  API Server  │────▶│  PostgreSQL DB  │
└─────────────┘     └──────────────┘     └─────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Redis Queue │
                    └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   Worker     │
                    └──────────────┘
```

### Visual Diagrams

**Class Diagram:**
![Class Diagram](class-diagram.png)

**Component Architecture:**
![Component Diagram](component-diagram.png)

**Sequence Flow:**

![Sequence Diagram](sequence-diagram.png)


### Key Features
- **Geospatial Matching**: O(log n) queries using PostGIS R-tree index
- **Event-Driven Processing**: Async queue for background matching
- **Concurrency Safety**: Row-level locking prevents race conditions
- **Real-time Driver Assignment**: Immediate driver allocation on pool creation
- **Dynamic Pricing**: Pooling discounts based on passenger count

## Algorithms & Data Structures

### 1. Spatial Indexing (R-tree via PostGIS GIST)
**Complexity**: O(log n)  
**Location**: `findBestPool()`, `findNearestDrivers()`  
**Purpose**: Efficiently find pools and drivers within geographic radius

### 2. Greedy Nearest Neighbor
**Complexity**: O(k) where k=10 (constant)  
**Location**: `findBestPool()` (after spatial query)  
**Purpose**: Select optimal pool from candidates by minimum detour

### 3. Insertion Heuristic (Route Optimization)
**Complexity**: O(n) where n≤8 (waypoints)  
**Location**: `calculateDetour()`  
**Purpose**: Check if adding passenger exceeds max detour tolerance

### 4. Pessimistic Row Locking
**Complexity**: O(1) atomic operation  
**Location**: `assignRideToPool()`, `assignDriverToPool()`  
**Purpose**: Prevent race conditions with `SELECT ... FOR UPDATE`

### 5. FIFO Queue with Retry
**Complexity**: O(1) enqueue/dequeue  
**Location**: `addRideToQueue()`, `processRideMatching()`  
**Purpose**: Asynchronous processing without blocking API

### Performance Targets
| Metric | Target | Achieved |
|--------|--------|----------|
| API Latency | <300ms | ~80ms (ride booking - major api)|
| Throughput | 100 req/s |  Supported due to locks, indexing and normalised shcema |
| Concurrent Users | 10,000 |  Scalable |

## Assumptions & Design Decisions

### Driver Assignment Model
**Current Implementation: Automatic Assignment**
- Drivers are **automatically assigned** to pools when a new pool is created
- System selects the nearest available driver without requiring manual acceptance
- Driver can reject by not showing up (out of scope for this version)

**Rationale:**
- Simpler implementation for MVP/demo
- Faster user experience (no waiting for driver acceptance)
- Common in airport shuttle services where drivers are employees

**Future Enhancement:**
- Add driver notification system
- Implement accept/reject flow with timeout
- Support multiple driver bidding on pool

### Airport Detection
- Airport location is provided by client (airportLat, airportLng parameters)
- Direction (airport_to_city vs city_to_airport) is calculated based on proximity to airport
- Maximum 2km radius considered "at airport"

### Capacity Constraints
- Vehicle capacity determined at pool creation from assigned driver's vehicle
- Pool max capacity = driver's vehicle maxSeats
- Once driver arrives, pool locks (no more passengers)

## Tech Stack

- **Database**: PostgreSQL with PostGIS extension
- **Cache/Queue**: Redis with BullMQ
- **Backend**: Next.js API Routes
- **ORM**: Drizzle ORM
- **Language**: TypeScript
- **Testing**: Bun Test
- **Container**: Docker Compose

## Project Structure

```
alike/
├── apps/
│   └── web/
│       ├── src/app/api/          # API Routes
│       │   ├── rides/            # Ride endpoints
│       │   └── drivers/          # Driver endpoints
│       └── src/lib/pricing.ts    # Pricing logic
├── packages/
│   └── db/
│       ├── src/
│       │   ├── schema/           # Database schema
│       │   ├── queries/          # Business logic
│       │   │   ├── rides.ts      # Matching and pooling
│       │   │   └── crud.ts       # CRUD operations
│       │   ├── events.ts         # Queue system
│       │   └── test/             
│       └── docker-compose.yml    
```

## Setup Instructions

### Prerequisites
- Bun 1.3.5+
- Docker Desktop
- Git

### 1. Clone & Install
```bash
git clone <repository>
cd alike
bun install
```

### 2. Start Services
```bash
# Start PostgreSQL and Redis (from project root)
cd alike
bun run db:start

# Verify services are running
docker ps
```

### 3. Database Setup
```bash
# From project root
cd alike

# Generate migrations (creates SQL files)
bun run db:generate

# Apply migrations to database
bun run db:migrate

# Seed the db
bun run db:seed

# Optional: Open database GUI
bun run db:studio
```

### 4. Environment Variables
Create `apps/web/.env`:
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/alike
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 5. Start Application
Terminal 1 - Start Worker (from project root):
```bash
cd alike
bun run queue:start
```

Terminal 2 - Start Web Server (from project root):
```bash
cd alike
bun run dev:web
```

The application will be available at:
- Web App: http://localhost:3000
- API Docs: http://localhost:3000/api-doc
- Database Studio: http://localhost:4983

## API Documentation

**📄 PDF Documentation**: See [`alike-api.pdf`](./alike-api.pdf) in the root directory for a complete Swagger API reference (print of the `/api-doc` page).

Interactive API documentation also available at `/api-doc` when running the app.

### Create Ride
```http
POST /api/rides
Content-Type: application/json

{
  "userId": "uuid",
  "pickupLat": 40.7128,
  "pickupLng": -74.0060,
  "dropoffLat": 40.7589,
  "dropoffLng": -73.9851,
  "seats": 1,
  "luggage": 1,
  "airportLat": 40.6413,
  "airportLng": -73.7781
}
```

**Response:**
```json
{
  "rideId": "uuid",
  "status": "pending",
  "direction": "city_to_airport",
  "estimatedPrice": 15.50,
  "message": "Finding your pool and driver..."
}
```

### Check Ride Status
```http
GET /api/rides/:id
```

**Response:**
```json
{
  "id": "uuid",
  "status": "matched",
  "pool": {
    "id": "uuid",
    "status": "forming",
    "filledSeats": 2,
    "maxSeats": 4,
    "driver": {
      "id": "uuid",
      "rating": "4.8"
    }
  }
}
```

### Update Driver Location
```http
POST /api/drivers/location
Content-Type: application/json

{
  "driverId": "uuid",
  "lat": 40.7128,
  "lng": -74.0060
}
```

### Driver Arrival (Locks Pool)
```http
POST /api/drivers/arrive/:poolId
Content-Type: application/json

{
  "driverId": "uuid"
}
```

## How It Works

### Ride Creation Flow
1. **User requests ride** → POST /api/rides
2. **System detects direction** (airport-to-city or city-to-airport)
3. **Saves to database** with status "pending"
4. **Adds to Redis queue** (instant response, < 100ms)
5. **Worker processes** job asynchronously
6. **Finds or creates pool** with driver assignment
7. **Updates ride status** to "matched"

### Pool Matching Algorithm
1. **Spatial Query**: Find pools within 5km radius (O(log n))
2. **Filter**: Same direction + capacity available
3. **Select**: Choose pool with minimum detour (O(k))
4. **Lock**: Row-level lock prevents race conditions
5. **Assign**: Add passenger, update capacity
6. **If no pool**: Create new pool with immediate driver assignment

### Concurrency Handling
- **Row Locking**: `SELECT ... FOR UPDATE` on pool rows
- **Optimistic Locking**: Version field for conflict detection
- **Queue Processing**: Single worker prevents concurrent modifications
- **Transaction Safety**: All updates within database transactions

## Database Schema

### Key Tables
- **users**: Passengers and drivers
- **drivers**: Driver profiles with real-time location
- **vehicles**: Vehicle capacity constraints
- **pools**: Shared ride containers
- **ride_requests**: Individual bookings

### Indexes
- GIST index on pickup locations (geospatial queries)
- GIST index on pool centers (geospatial queries)
- B-tree indexes on status, driver_id, user_id
- Composite indexes for common queries

**Quick Start:** Try running `./setup.sh` to automate the entire setup process (starts services, runs migrations, and seeds data).

## Pricing Formula

```
Base Price = $5 + (distance_km × $2.5 × seats)
Discount = Base Price × (passengers / 4) × 0.5
Final Price = Base Price - Discount

Example: 20km, 2 seats, 2 passengers
Base = $5 + (20 × $2.5 × 2) = $105
Discount = $105 × (2/4) × 0.5 = $26.25
Final = $78.75 (26% savings)
```

## Detour Algorithm Explained

When adding a new passenger to an existing pool, we must ensure the detour doesn't inconvenience existing passengers too much.

### The Problem
- Existing pool: Pickup A → Pickup B → Airport
- New passenger wants to join at Pickup C
- Where should we insert C to minimize extra distance?

### The Solution: Brute-Force Insertion Heuristic

Since pools have max 8 passengers (4 pickups + 4 dropoffs), we can try ALL possible insertion positions:

**Algorithm Steps:**
1. Get current route waypoints (pickups and dropoffs)
2. Calculate current total distance
3. For each possible insertion position (0 to n):
   - Insert new pickup/dropoff at position i
   - Calculate new total distance
   - Track the minimum distance found
4. Detour = (new distance - current distance)
5. If detour ≤ maxDetourKm (default 3km), passenger can join

**Example:**
```
Current: Home A → Home B → Airport [15km total]

Try inserting Home C at position 0:
  Home C → Home A → Home B → Airport = 18km (detour: 3km) ✓

Try inserting Home C at position 1:
  Home A → Home C → Home B → Airport = 16.5km (detour: 1.5km) ✓ BEST

Try inserting Home C at position 2:
  Home A → Home B → Home C → Airport = 17km (detour: 2km) ✓
```

**Complexity:** O(n²) where n ≤ 8 waypoints → effectively O(1) constant time

**Why Not A* or Dijkstra?** 
- We don't need the absolute shortest path between two points
- We need the best INSERTION position in an existing route
- With only 8 waypoints, brute-force is fast and guarantees optimal insertion
- Real routing APIs (Google Maps, OSRM) would be used in production for actual driving distances

## Testing

```bash
# From project root
cd alike

# Run all tests
bun run test

# Run database tests
bun run test --filter @alike/db
```

### Test Coverage
- Database schema validation
- Geospatial matching accuracy
- Concurrency/race condition handling
- Queue processing latency
- Pool capacity enforcement
- Driver assignment flow

## Development Scripts

| Script | Description |
|--------|-------------|
| `bun run db:start` | Start PostgreSQL + Redis |
| `bun run db:stop` | Stop services |
| `bun run db:migrate` | Apply migrations |
| `bun run db:studio` | Open database GUI |
| `bun run queue:start` | Start background worker |
| `bun run dev:web` | Start web server |
| `bun run test` | Run tests |

## Technical Implementation Details

### Infrastructure Setup

**Docker Compose Configuration (`packages/db/docker-compose.yml`):**
- **PostgreSQL**: Uses `postgis/postgis:16-3.4` image (includes PostGIS extension for geospatial queries)
- **Redis**: Uses `redis:alpine` image for lightweight queue storage
- **Volumes**: Persistent storage for both services (data survives container restarts)
- **Ports**: PostgreSQL on 5432, Redis on 6379

**Why These Images:**
- PostGIS: Required for `ST_DWithin()` and other geospatial functions
- Redis Alpine: Minimal footprint, perfect for queue storage
- Both restart automatically if they crash

### Database Configuration (Drizzle)

**Schema Management:**
```
packages/db/src/schema/schema.ts  # Table definitions
packages/db/drizzle.config.ts      # ORM configuration
packages/db/src/migrations/        # Generated SQL files
```

**Configuration Changes Made:**
- Updated `drizzle.config.ts` to look for `.env` in multiple locations
- Ensured DATABASE_URL is always loaded before migrations
- PostGIS extension auto-enabled via Docker image (no manual setup)

**Migration Flow:**
1. `bun run db:generate` - Reads schema.ts, creates SQL migration files
2. `bun run db:migrate` - Applies migrations to PostgreSQL
3. Migrations are idempotent (safe to run multiple times)

### Event Queue (BullMQ + Redis)

**Architecture:**
```
API Server → Redis Queue → Worker Process
     ↓                         ↓
   Instant               Background
   Response              Processing
```

**How It Works:**
1. User creates ride → API adds job to Redis (BullMQ)
2. API returns immediately (no waiting for matching)
3. Worker process picks up job from Redis
4. Worker queries PostgreSQL, finds/creates pool
5. Worker updates ride status to "matched"

**Why BullMQ:**
- **Persistent**: Jobs survive crashes (stored in Redis)
- **Retry Logic**: Failed jobs auto-retry 3 times
- **Scalable**: Can run multiple workers for load balancing
- **Atomic**: Prevents race conditions in job processing

**Worker Startup:**
```bash
cd packages/db
bunx tsx src/start-worker.ts
```

**Monitoring Queue:**
```bash
redis-cli
LLEN bull:ride-matching:wait  # See pending jobs
```

## Complexity Analysis Summary

| Operation | Algorithm | Time | Space |
|-----------|-----------|------|-------|
| Find nearby pools | R-tree Index | O(log n) | O(1) |
| Find nearest drivers | R-tree Index | O(log m) | O(1) |
| Select best pool | Greedy | O(k) | O(1) |
| Calculate detour | Insertion | O(n) | O(1) |
| Assign to pool | Row Lock | O(1) | O(1) |
| Queue operation | FIFO | O(1) | O(1) |

**n** = number of pools, **m** = number of drivers, **k** = 10 (candidates)

## License

MIT

## Author

Built for Airport Ride Pooling System Assignment
