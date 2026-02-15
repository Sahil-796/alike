import { Queue, Worker } from "bullmq";
import { 
  findBestPool, 
  assignRideToPool, 
  createPoolForRide 
} from "./queries/rides";
import { updatePoolStatus } from "./queries/crud";

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
};

export const rideQueue = new Queue("ride-matching", { connection });

export async function addRideToQueue(rideData: {
  rideId: string;
  userId: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  seats: number;
  luggage: number;
  direction: 'airport_to_city' | 'city_to_airport';
}) {
  await rideQueue.add("find-pool", rideData, {
    attempts: 3,
    backoff: 5000,
  });
}

export function startRideWorker() {
  const worker = new Worker("ride-matching", async (job) => {
    if (job.name === "find-pool") {
      await processRideMatching(job.data);
    }
    return { success: true };
  }, { 
    connection: {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
    }
  });
  
  worker.on("completed", (job) => {
    console.log(`✅ Job ${job.id} completed`);
  });
  
  worker.on("failed", (job, err) => {
    console.error(`❌ Job ${job?.id} failed:`, err.message);
  });
  
  return worker;
}

// ============================================================================
// PROCESS RIDE MATCHING - THE ACTUAL ALGORITHM
// ============================================================================

async function processRideMatching(data: {
  rideId: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  seats: number;
  luggage: number;
  direction: 'airport_to_city' | 'city_to_airport';
}) {
  console.log(`🔍 Processing ride ${data.rideId}...`);
  console.log(`   Pickup: ${data.pickupLat}, ${data.pickupLng}`);
  console.log(`   Direction: ${data.direction}`);
  console.log(`   Seats: ${data.seats}, Luggage: ${data.luggage}`);

  try {
    console.log(`   Step 1: Searching for existing pools...`);
    
    const existingPool = await findBestPool(
      data.pickupLat,
      data.pickupLng,
      data.dropoffLat,
      data.dropoffLng,
      data.seats,
      data.luggage,
      data.direction,
      5
    );

    if (existingPool) {
      console.log(`   Step 2a: Found pool ${existingPool.id}! Assigning...`);
      
      const result = await assignRideToPool(
        data.rideId,
        existingPool.id,
        12.50
      );

      if (result.success) {
        console.log(`   Ride ${data.rideId} matched to pool ${existingPool.id}`);
        console.log(`   Price: $12.50`);
        
        if (existingPool.filledSeats + data.seats >= existingPool.maxSeats) {
          console.log(`   Pool ${existingPool.id} is now FULL!`);
          await updatePoolStatus(existingPool.id, "locked");
        }
      } else {
        console.error(`   ❌ Failed to assign: ${result.error}`);
        await createNewPoolForRide(data);
      }
      
    } else {
      console.log(`   Step 2b: No matching pool found. Creating new pool...`);
      await createNewPoolForRide(data);
    }

  } catch (error) {
    console.error(`   ❌ Error processing ride ${data.rideId}:`, error);
  }

  console.log(`   Done processing ride ${data.rideId}\n`);
}

// ============================================================================
// HELPER: Create new pool when no match found
// ============================================================================

async function createNewPoolForRide(data: {
  rideId: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  seats: number;
  luggage: number;
  direction: 'airport_to_city' | 'city_to_airport';
}) {
  const pool = await createPoolForRide(data.rideId, {
    pickupLat: data.pickupLat,
    pickupLng: data.pickupLng,
    dropoffLat: data.dropoffLat,
    dropoffLng: data.dropoffLng,
    seats: data.seats,
    luggage: data.luggage,
    direction: data.direction,
  });

  if (pool) {
    console.log(`   ✅ Created new pool ${pool.id} for ride ${data.rideId}`);
    console.log(`   💰 Price: $15.00 (solo until matched)`);
  } else {
    console.error(`   ❌ Failed to create pool for ride ${data.rideId}`);
  }
}

// ============================================================================
// API USAGE EXAMPLES
// ============================================================================

/*
// apps/web/src/app/api/rides/route.ts
import { addRideToQueue } from "@alike/db/events";
import { createRideRequest } from "@alike/db/queries/rides";

export async function POST(request: Request) {
  const body = await request.json();
  
  // 1. Save ride to database with status "pending"
  const ride = await createRideRequest(body);
  
  // 2. Add to queue (INSTANT - doesn't wait!)
  await addRideToQueue({
    rideId: ride.id,
    userId: ride.userId,
    pickupLat: ride.pickupLat,
    pickupLng: ride.pickupLng,
    dropoffLat: ride.dropoffLat,
    dropoffLng: ride.dropoffLng,
    seats: ride.seats,
    luggage: ride.luggage,
  });
  
  // 3. Return immediately!
  return Response.json({
    rideId: ride.id,
    status: "pending",
    message: "We're finding your pool..."
  });
}

// apps/web/src/app/api/rides/[id]/route.ts
import { getRideRequestById } from "@alike/db/queries/crud";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const ride = await getRideRequestById(params.id);
  
  return Response.json({
    id: ride.id,
    status: ride.status,  // "pending" → "matched" → "confirmed"
    poolId: ride.poolId,
  });
}

// To start worker, add to your main server file:
import { startRideWorker } from "@alike/db/events";
startRideWorker();
*/
