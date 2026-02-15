import { eq, and, sql } from "drizzle-orm";
import { db } from "../index";
import { rideRequests, pools, type RideRequest, type Pool } from "../schema/schema";

// ============================================================================
// RIDE STATUS UPDATES
// ============================================================================

export async function updateRideStatus(
  rideId: string,
  status: RideRequest["status"]
): Promise<RideRequest | undefined> {
  const updates: Partial<RideRequest> = { status };

  // Set timestamps based on status
  if (status === "matched") updates.matchedAt = new Date();
  if (status === "confirmed") updates.confirmedAt = new Date();
  if (status === "ongoing") updates.startedAt = new Date();
  if (status === "completed") updates.completedAt = new Date();
  if (status === "cancelled") updates.cancelledAt = new Date();

  const [ride] = await db
    .update(rideRequests)
    .set(updates)
    .where(eq(rideRequests.id, rideId))
    .returning();

  return ride;
}

// ============================================================================
// ASSIGN RIDE TO POOL (with optimistic locking)
// ============================================================================

export async function assignRideToPool(
  rideId: string,
  poolId: string,
  price: number
): Promise<{ success: boolean; ride?: RideRequest; error?: string }> {
  return db.transaction(async (tx) => {
    // 1. Lock the pool row
    const [pool] = await tx
      .select()
      .from(pools)
      .where(eq(pools.id, poolId))
      .for("update");

    if (!pool) {
      return { success: false, error: "Pool not found" };
    }

    // 2. Get ride details
    const [ride] = await tx
      .select()
      .from(rideRequests)
      .where(eq(rideRequests.id, rideId));

    if (!ride) {
      return { success: false, error: "Ride not found" };
    }

    // 3. Check capacity
    if (pool.filledSeats + ride.seats > pool.maxSeats) {
      return { success: false, error: "Not enough seats" };
    }

    if (pool.filledLuggage + ride.luggage > pool.maxLuggage) {
      return { success: false, error: "Not enough luggage space" };
    }

    // 4. Update pool capacity
    await tx
      .update(pools)
      .set({
        filledSeats: pool.filledSeats + ride.seats,
        filledLuggage: pool.filledLuggage + ride.luggage,
        version: pool.version + 1,
      })
      .where(eq(pools.id, poolId));

    // 5. Assign ride to pool
    const [updatedRide] = await tx
      .update(rideRequests)
      .set({
        poolId,
        individualPrice: price.toString(),
        status: "matched",
        matchedAt: new Date(),
      })
      .where(eq(rideRequests.id, rideId))
      .returning();

    return { success: true, ride: updatedRide };
  });
}

// ============================================================================
// FIND BEST POOL FOR RIDE (used by matching algorithm)
// ============================================================================

export async function findBestPool(
  pickupLat: number,
  pickupLng: number,
  seats: number,
  luggage: number,
  maxDistanceKm: number = 5
): Promise<Pool | undefined> {
  // Get all forming pools with capacity
  const availablePools = await db.query.pools.findMany({
    where: and(
      eq(pools.status, "forming"),
      sql`${pools.filledSeats} + ${seats} <= ${pools.maxSeats}`,
      sql`${pools.filledLuggage} + ${luggage} <= ${pools.maxLuggage}`
    ),
  });

  if (availablePools.length === 0) {
    return undefined;
  }

  // Find closest pool
  let bestPool: Pool | undefined;
  let minDistance = Infinity;

  for (const pool of availablePools) {
    // Calculate distance from pickup to pool center
    // For now, just return first available (you can improve this!)
    const distance = calculateDistance(
      pickupLat,
      pickupLng,
      40.7128, // TODO: Get pool center from waypoints or add centerLat/centerLng to schema
      -74.0060
    );

    if (distance < minDistance && distance <= maxDistanceKm) {
      minDistance = distance;
      bestPool = pool;
    }
  }

  return bestPool;
}

// ============================================================================
// CREATE NEW POOL FOR RIDE
// ============================================================================

export async function createPoolForRide(
  rideId: string,
  rideData: {
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
    seats: number;
    luggage: number;
  }
): Promise<Pool | undefined> {
  return db.transaction(async (tx) => {
    // 1. Create new pool
    const [pool] = await tx
      .insert(pools)
      .values({
        maxSeats: 4,
        maxLuggage: 4,
        filledSeats: rideData.seats,
        filledLuggage: rideData.luggage,
        status: "forming",
        waypoints: [
          {
            lat: rideData.pickupLat,
            lng: rideData.pickupLng,
            type: "pickup",
            rideRequestId: rideId,
            sequence: 1,
          },
          {
            lat: rideData.dropoffLat,
            lng: rideData.dropoffLng,
            type: "dropoff",
            rideRequestId: rideId,
            sequence: 2,
          },
        ],
      })
      .returning();

    if (!pool) {
      return undefined;
    }

    // 2. Assign ride to new pool
    await tx
      .update(rideRequests)
      .set({
        poolId: pool.id,
        individualPrice: "15.00", // Default price
        status: "matched",
        matchedAt: new Date(),
      })
      .where(eq(rideRequests.id, rideId));

    return pool;
  });
}

// ============================================================================
// HELPER: Calculate distance between two points (Haversine formula)
// ============================================================================

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
