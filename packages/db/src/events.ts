import { Queue, Worker } from "bullmq";
import { 
  findBestPool, 
  assignRideToPool, 
  createPoolForRide,
  cancelPoolForRide
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
    if (job.name === "cancel-ride") {
      await cancelRide(job.data);
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
          await updatePoolStatus(existingPool.id, "driver_assigned");
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
  const result = await createPoolForRide(data.rideId, {
    pickupLat: data.pickupLat,
    pickupLng: data.pickupLng,
    dropoffLat: data.dropoffLat,
    dropoffLng: data.dropoffLng,
    seats: data.seats,
    luggage: data.luggage,
    direction: data.direction,
  });

  if (result.pool && result.driver) {
    console.log(`   ✅ Created new pool ${result.pool.id} for ride ${data.rideId}`);
    console.log(`   🚗 Driver ${result.driver.id} assigned immediately`);
    console.log(`   📍 Driver is driving to pickup location`);
    console.log(`   💰 Price: $15.00 (more passengers can join until driver arrives)`);
    console.log(`   🔒 Pool will lock when driver reaches pickup`);
  } else {
    console.error(`   ❌ Failed to create pool for ride ${data.rideId}: ${result.error}`);
  }
}



// ============================================================================
// cancel ride
// ============================================================================

async function cancelRide(data: {
  rideId: string;
}) {
  const result = await cancelPoolForRide(data.rideId);
  // this is a crud api which handles updating the db for cancelled status in ride requests
  // also removes passenger from the pool
  // 
  // however we handle the logic about cancellation fee in this working on the basis of 
  // whether the driver hasnt arrived yet (no fees) or he has arrived (charged cancellation)
  // 
  // or any other services which might be needed to call 
  // eg: invoice, payment apis, email, company logistics 

  if (result.success) {
    console.log(`    Cancelled ride ${data.rideId}${result.fee ? ` (fee: $${result.fee})` : ''}`);
  } else {
    console.error(`    Failed to cancel ride ${data.rideId}: ${result.error}`);
  }
}


