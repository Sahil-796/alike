import { eq, sql } from "drizzle-orm";
import { db } from "../index";
import { rideRequests, pools, drivers, vehicles, type RideRequest, type Pool, type Driver } from "../schema/schema";

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

// documenting for concurrency handling as mentioned in PS
// ============================================================================
// ASSIGN RIDE TO POOL (with locking and versioning) (uses tx as transactions which ensure locking of rows
// by .forUpdate())
// ============================================================================

export async function assignRideToPool(
  rideId: string,
  poolId: string,
  price: number
): Promise<{ success: boolean; ride?: RideRequest; error?: string }> {
  
  return db.transaction(async (tx) => {
    
    const [pool] = await tx
      .select()
      .from(pools)
      .where(eq(pools.id, poolId))
      .for("update");

    if (!pool) {
      return { success: false, error: "Pool not found" };
    }

    const [ride] = await tx
      .select()
      .from(rideRequests)
      .where(eq(rideRequests.id, rideId));

    if (!ride) {
      return { success: false, error: "Ride not found" };
    }

    if (pool.filledSeats + ride.seats > pool.maxSeats) {
      return { success: false, error: "Not enough seats" };
    }

    if (pool.filledLuggage + ride.luggage > pool.maxLuggage) {
      return { success: false, error: "Not enough luggage space" };
    }

    const updatedWaypoints = [...(pool.waypoints || []), {
      lat: Number(ride.pickupLat),
      lng: Number(ride.pickupLng),
      type: "pickup" as const,
      rideRequestId: rideId,
      sequence: (pool.waypoints?.length || 0) + 1,
    }, {
      lat: Number(ride.dropoffLat),
      lng: Number(ride.dropoffLng),
      type: "dropoff" as const,
      rideRequestId: rideId,
      sequence: (pool.waypoints?.length || 0) + 2,
    }];

    const newCenter = calculatePoolCenter(updatedWaypoints);

    await tx
      .update(pools)
      .set({
        filledSeats: pool.filledSeats + ride.seats,
        filledLuggage: pool.filledLuggage + ride.luggage,
        waypoints: updatedWaypoints,
        centerLat: newCenter.lat.toString(),
        centerLng: newCenter.lng.toString(),
        version: pool.version + 1,  // this handles versioning for pool updates which eventually ensure consistency across multiple updates
      })
      .where(eq(pools.id, poolId));

    // final db update for rideRequest
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
// FIND BEST POOL FOR RIDE
// ============================================================================

export async function findBestPool(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
  seats: number,
  luggage: number,
  direction: 'airport_to_city' | 'city_to_airport',
  maxDistanceKm: number = 5
): Promise<Pool | undefined> {

  const maxDistanceMeters = maxDistanceKm * 1000;

  // ST_DWithin ->> O(log n) performance
  // status = forming (i.e not locked), driver assigned, checks direction, seats, luggage and max distance range
  const result = await db.execute<Pool>(sql`
    SELECT * FROM pools
    WHERE status = 'forming'
      AND driver_id is NOT NULL
      AND direction = ${direction}
      AND (filled_seats + ${seats}) <= max_seats
      AND (filled_luggage + ${luggage}) <= max_luggage
      AND ST_DWithin(
        ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${pickupLng}, ${pickupLat}), 4326)::geography,
        ${maxDistanceMeters}
      )
    ORDER BY ST_Distance(
      ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
      ST_SetSRID(ST_MakePoint(${pickupLng}, ${pickupLat}), 4326)::geography
    )
    LIMIT 10
  `);

  const availablePools = result.rows || [];

  if (availablePools.length === 0) {
    return undefined;
  }

  let bestPool: Pool | undefined;
  let minDetour = Infinity;

  for (const pool of availablePools) {
    const detour = await calculateDetour(pool, pickupLat, pickupLng, dropoffLat, dropoffLng);
    
    if (detour < minDetour) {
      minDetour = detour;
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
    direction: 'airport_to_city' | 'city_to_airport';
  }
): Promise<{ pool?: Pool; driver?: Driver; error?: string }> {
  return db.transaction(async (tx) => {
    // Find nearest available driver
    const driverResult = await tx.execute<{ id: string; distance: number }>(sql`
      SELECT 
        d.id,
        ST_Distance(
          ST_SetSRID(ST_MakePoint(d.current_lng, d.current_lat), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${rideData.pickupLng}, ${rideData.pickupLat}), 4326)::geography
        ) / 1000 as distance
      FROM drivers d
      WHERE d.status = 'available'
        AND d.current_lat IS NOT NULL
        AND d.current_lng IS NOT NULL
      ORDER BY distance
      LIMIT 1
    `);

    const nearestDriver = driverResult.rows?.[0];
    
    if (!nearestDriver) {
      return { error: "No available drivers nearby" };
    }

    // driver details and vehicle with lock
    const [driver] = await tx
      .select()
      .from(drivers)
      .where(eq(drivers.id, nearestDriver.id))
      .for("update");

    if (!driver || driver.status !== 'available') {
      return { error: "Driver no longer available" };
    }

    // vehicle capacity
    const [vehicle] = await tx
      .select()
      .from(vehicles)
      .where(eq(vehicles.driverId, driver.id));

    const maxSeats = vehicle?.maxSeats || 4;
    const maxLuggage = vehicle?.maxLuggage || 4;

    // Check if initial ride fits. classic edge case 
    if (rideData.seats > maxSeats || rideData.luggage > maxLuggage) {
      return { error: "Ride exceeds vehicle capacity" };
    }

    const waypoints = [
      {
        lat: rideData.pickupLat,
        lng: rideData.pickupLng,
        type: "pickup" as const,
        rideRequestId: rideId,
        sequence: 1,
      },
      {
        lat: rideData.dropoffLat,
        lng: rideData.dropoffLng,
        type: "dropoff" as const,
        rideRequestId: rideId,
        sequence: 2,
      },
    ];

    const center = calculatePoolCenter(waypoints);

    // Create pool with assigned driver
    const [pool] = await tx
      .insert(pools)
      .values({
        driverId: driver.id,
        maxSeats: maxSeats,
        maxLuggage: maxLuggage,
        filledSeats: rideData.seats,
        filledLuggage: rideData.luggage,
        status: "forming",
        direction: rideData.direction,
        centerLat: center.lat.toString(),
        centerLng: center.lng.toString(),
        waypoints,
      })
      .returning();

    if (!pool) {
      return { error: "Failed to create pool" };
    }

    //Update driver status to assigned
    await tx
      .update(drivers)
      .set({ status: 'assigned' })
      .where(eq(drivers.id, driver.id));

    // Assign initial ride to pool
    await tx
      .update(rideRequests)
      .set({
        poolId: pool.id,
        individualPrice: "15.00",
        status: "matched",
        matchedAt: new Date(),
      })
      .where(eq(rideRequests.id, rideId));

    return { pool, driver };
  });
}

// ============================================================================
// FIND NEAREST DRIVERS (for pool assignment)
// ============================================================================

export async function findNearestDrivers(
  centerLat: number,
  centerLng: number,
  maxDistanceKm: number = 10,
  limit: number = 5
): Promise<Array<{ id: string; distance: number }>> {
  const maxDistanceMeters = maxDistanceKm * 1000;

  const result = await db.execute<{ id: string; distance: number }>(sql`
    SELECT 
      id,
      ST_Distance(
        ST_SetSRID(ST_MakePoint(current_lng, current_lat), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${centerLng}, ${centerLat}), 4326)::geography
      ) / 1000 as distance
    FROM drivers
    WHERE status = 'available'
      AND current_lat IS NOT NULL
      AND current_lng IS NOT NULL
      AND ST_DWithin(
        ST_SetSRID(ST_MakePoint(current_lng, current_lat), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${centerLng}, ${centerLat}), 4326)::geography,
        ${maxDistanceMeters}
      )
    ORDER BY distance
    LIMIT ${limit}
  `);

  return result.rows || [];
}

// ============================================================================
// DRIVER ASSIGNMENT (accept pool)
// ============================================================================

export async function assignDriverToPool(
  poolId: string,
  driverId: string
): Promise<{ success: boolean; error?: string }> {
  return db.transaction(async (tx) => {
    // 1. Check driver is available
    const [driver] = await tx
      .select()
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .for("update");

    if (!driver || driver.status !== 'available') {
      return { success: false, error: "Driver not available" };
    }

    // 2. Lock pool and check status
    const [pool] = await tx
      .select()
      .from(pools)
      .where(eq(pools.id, poolId))
      .for("update");

    if (!pool || pool.status !== 'locked') {
      return { success: false, error: "Pool not available for assignment" };
    }

    if (pool.driverId) {
      return { success: false, error: "Pool already has driver" };
    }

    // 3. Assign driver to pool
    await tx
      .update(pools)
      .set({
        driverId,
        status: 'driver_assigned',
      })
      .where(eq(pools.id, poolId));

    // 4. Mark driver as assigned
    await tx
      .update(drivers)
      .set({ status: 'assigned' })
      .where(eq(drivers.id, driverId));

    // 5. Update all ride requests in pool
    await tx
      .update(rideRequests)
      .set({ status: 'confirmed' })
      .where(eq(rideRequests.poolId, poolId));

    return { success: true };
  });
}

// ============================================================================
// DRIVER ARRIVAL - Lock pool
// ============================================================================

export async function driverArrived(
  poolId: string,
  driverId: string
): Promise<{ success: boolean; error?: string; pool?: Pool }> {
  return db.transaction(async (tx) => {

    const [pool] = await tx
      .select()
      .from(pools)
      .where(eq(pools.id, poolId))
      .for("update");

    if (!pool) {
      return { success: false, error: "Pool not found" };
    }

    if (pool.driverId !== driverId) {
      return { success: false, error: "Not authorized to lock this pool" };
    }

    if (pool.status !== 'forming') {
      return { success: false, error: "Pool is not in forming state" };
    }

    // lock pool
    const [updatedPool] = await tx
      .update(pools)
      .set({
        status: 'locked',
        lockedAt: new Date(),
      })
      .where(eq(pools.id, poolId))
      .returning();

    // Update all ride requests to confirmed
    await tx
      .update(rideRequests)
      .set({ status: 'confirmed' })
      .where(eq(rideRequests.poolId, poolId));

    return { success: true, pool: updatedPool };
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculatePoolCenter(waypoints: Array<{ lat: number; lng: number }>): { lat: number; lng: number } {
  if (waypoints.length === 0) return { lat: 0, lng: 0 };
  
  const sumLat = waypoints.reduce((sum, wp) => sum + wp.lat, 0);
  const sumLng = waypoints.reduce((sum, wp) => sum + wp.lng, 0);
  
  return {
    lat: sumLat / waypoints.length,
    lng: sumLng / waypoints.length,
  };
}

async function calculateDetour(
  pool: Pool,
  newPickupLat: number,
  newPickupLng: number,
  newDropoffLat: number,
  newDropoffLng: number
): Promise<number> {
  // Simple detour calculation: 
  // Current route distance + distance to new pickup/dropoff
  // This is a simplified version - in production, use proper route optimization
  
  const waypoints = pool.waypoints || [];
  if (waypoints.length < 2) return 0;

  // Calculate current route distance
  let currentDistance = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const prev = waypoints[i - 1];
    const curr = waypoints[i];
    if (!prev || !curr) continue;
    currentDistance += calculateDistance(
      prev.lat,
      prev.lng,
      curr.lat,
      curr.lng
    );
  }

  // Calculate new route with insertion
  // For simplicity, add new pickup after last pickup, new dropoff before first dropoff
  const pickups = waypoints.filter(w => w.type === 'pickup');
  const dropoffs = waypoints.filter(w => w.type === 'dropoff');

  let newDistance = 0;
  
  // Route: existing pickups -> new pickup -> new dropoff -> existing dropoffs
  const lastPickup = pickups[pickups.length - 1];
  if (lastPickup) {
    newDistance += calculateDistance(
      lastPickup.lat,
      lastPickup.lng,
      newPickupLat,
      newPickupLng
    );
  }
  
  newDistance += calculateDistance(newPickupLat, newPickupLng, newDropoffLat, newDropoffLng);
  
  const firstDropoff = dropoffs[0];
  if (firstDropoff) {
    newDistance += calculateDistance(
      newDropoffLat,
      newDropoffLng,
      firstDropoff.lat,
      firstDropoff.lng
    );
  }

  return newDistance - currentDistance;
}

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
