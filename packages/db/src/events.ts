import { Queue, Worker } from "bullmq";

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
}) {
  await rideQueue.add("find-pool", rideData, {
    attempts: 3,
    backoff: 5000,
  });
}

export function startRideWorker() {
  
  // new worker. the callback runs for every job listed
  const worker = new Worker("ride-matching", async (job) => {
    
    // this runs processRideMatching whenever addRideToQueue is called by api
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
// BACKGROUND PROCESSING rides to pool
// ============================================================================

async function processRideMatching(data: {
  rideId: string;
  pickupLat: number;
  pickupLng: number;
  seats: number;
  luggage: number;
}) {
  // TODO: Implement your matching logic here
  // 1. Find nearby pools
  // 2. Check capacity
  // 3. Assign ride to pool
  // 4. Update database
  // console.log(`Finding pool for ride ${data.rideId}...`);
  
  
  const pool = await findBestPool(data.pickupLat, data.pickupLng, data.seats);
  if (pool) {
    await assignRideToPool(data.rideId, pool.id);
    await updateRideStatus(data.rideId, "matched");
  }
  
  console.log(`✅ Done processing ride ${data.rideId}`);
}







/*
// apps/web/src/app/api/rides/route.ts
import { addRideToQueue } from "@alike/db/events";

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
