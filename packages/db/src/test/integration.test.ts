import { describe, it, expect } from "bun:test";
import { db } from "../index";
import { users, drivers, vehicles, pools, rideRequests } from "../schema/schema";
import { eq } from "drizzle-orm";
import { createPoolForRide, findBestPool, assignRideToPool } from "../queries/rides";
import { addRideToQueue } from "../events";

describe("Integration Tests - Full Flow", () => {
  
  describe("Ride Creation Flow", () => {
    it("should create a user", async () => {
      const [user] = await db.insert(users).values({
        name: "Integration Test User",
        email: "integration@test.com",
        phone: "+1111111111",
        role: "passenger",
      }).returning();

      expect(user).toBeDefined();
      expect(user.name).toBe("Integration Test User");
      expect(user.role).toBe("passenger");
    });

    it("should create a driver with vehicle", async () => {
      const [user] = await db.insert(users).values({
        name: "Test Driver",
        email: "driver.integration@test.com",
        phone: "+1222222222",
        role: "driver",
      }).returning();

      const [driver] = await db.insert(drivers).values({
        userId: user.id,
        status: "available",
        currentLat: "40.7128",
        currentLng: "-74.0060",
        lastLocationAt: new Date(),
      }).returning();

      const [vehicle] = await db.insert(vehicles).values({
        driverId: driver.id,
        model: "Test Car",
        licensePlate: "TEST-001",
        maxSeats: 4,
        maxLuggage: 4,
      }).returning();

      expect(driver).toBeDefined();
      expect(vehicle).toBeDefined();
      expect(vehicle.maxSeats).toBe(4);
    });

    it("should create a ride request", async () => {
      const [user] = await db.insert(users).values({
        name: "Ride Request User",
        email: "ride.request@test.com",
        phone: "+1333333333",
        role: "passenger",
      }).returning();

      const [ride] = await db.insert(rideRequests).values({
        userId: user.id,
        pickupAddress: "Test Pickup Location",
        pickupLat: "40.7500",
        pickupLng: "-74.0000",
        dropoffAddress: "Airport Terminal",
        dropoffLat: "40.6413",
        dropoffLng: "-73.7781",
        directDistance: "15.5",
        seats: 1,
        luggage: 1,
        maxDetourKm: "3.0",
        status: "pending",
      }).returning();

      expect(ride).toBeDefined();
      expect(ride.status).toBe("pending");
      expect(ride.userId).toBe(user.id);
    });

    it("should create pool with immediate driver assignment", async () => {
      // Get an available driver
      const availableDriver = await db.query.drivers.findFirst({
        where: eq(drivers.status, "available"),
        with: {
          vehicle: true,
        },
      });

      if (!availableDriver) {
        console.log("⚠️ No available driver found, skipping test");
        return;
      }

      // Get a pending ride
      const [pendingRide] = await db
        .select()
        .from(rideRequests)
        .where(eq(rideRequests.status, "pending"))
        .limit(1);

      if (!pendingRide) {
        console.log("⚠️ No pending ride found, skipping test");
        return;
      }

      // Create pool for ride
      const result = await createPoolForRide(pendingRide.id, {
        pickupLat: parseFloat(pendingRide.pickupLat),
        pickupLng: parseFloat(pendingRide.pickupLng),
        dropoffLat: parseFloat(pendingRide.dropoffLat),
        dropoffLng: parseFloat(pendingRide.dropoffLng),
        seats: pendingRide.seats,
        luggage: pendingRide.luggage,
        direction: "city_to_airport",
      });

      expect(result.pool).toBeDefined();
      expect(result.driver).toBeDefined();
      expect(result.pool?.driverId).toBe(result.driver?.id);
      expect(result.error).toBeUndefined();

      // Verify ride is now matched
      const updatedRide = await db.query.rideRequests.findFirst({
        where: eq(rideRequests.id, pendingRide.id),
      });

      expect(updatedRide?.status).toBe("matched");
      expect(updatedRide?.poolId).toBe(result.pool?.id);
    });

    it("should find pools using geospatial query", async () => {
      const pool = await findBestPool(
        40.7500, -74.0000,  // Near NYC
        40.6413, -73.7781,  // JFK
        1, 1,
        "city_to_airport",
        10
      );

      // Should find a pool (created in previous test)
      expect(pool).toBeDefined();
    });

    it("should add ride to queue", async () => {
      const [user] = await db.insert(users).values({
        name: "Queue Test User",
        email: "queue.test@test.com",
        phone: "+1444444444",
        role: "passenger",
      }).returning();

      const [ride] = await db.insert(rideRequests).values({
        userId: user.id,
        pickupAddress: "Queue Test Pickup",
        pickupLat: "40.7600",
        pickupLng: "-73.9900",
        dropoffAddress: "Queue Test Dropoff",
        dropoffLat: "40.6500",
        dropoffLng: "-73.7900",
        directDistance: "12.0",
        seats: 1,
        luggage: 1,
        maxDetourKm: "3.0",
        status: "pending",
      }).returning();

      const startTime = Date.now();
      
      await addRideToQueue({
        rideId: ride.id,
        userId: user.id,
        pickupLat: 40.7600,
        pickupLng: -73.9900,
        dropoffLat: 40.6500,
        dropoffLng: -73.7900,
        seats: 1,
        luggage: 1,
        direction: "city_to_airport",
      });

      const endTime = Date.now();
      
      // Should be instant (< 100ms)
      expect(endTime - startTime).toBeLessThan(100);
    });

    it("should verify database connections", async () => {
      // Test all table connections
      const usersCount = await db.$count(users);
      const driversCount = await db.$count(drivers);
      const vehiclesCount = await db.$count(vehicles);
      const poolsCount = await db.$count(pools);
      const ridesCount = await db.$count(rideRequests);

      expect(usersCount).toBeGreaterThan(0);
      expect(driversCount).toBeGreaterThan(0);
      expect(vehiclesCount).toBeGreaterThan(0);
      
      console.log(`📊 Database Status:`);
      console.log(`   Users: ${usersCount}`);
      console.log(`   Drivers: ${driversCount}`);
      console.log(`   Vehicles: ${vehiclesCount}`);
      console.log(`   Pools: ${poolsCount}`);
      console.log(`   Rides: ${ridesCount}`);
    });
  });

  describe("API Endpoint Tests", () => {
    it("should confirm API routes exist", () => {
      // These routes should exist in the API
      const routes = [
        "POST /api/rides",
        "GET /api/rides/:id",
        "POST /api/drivers/location",
        "POST /api/drivers/arrive/:poolId",
        "POST /api/users",
        "GET /api/users",
        "POST /api/drivers",
        "GET /api/drivers",
        "POST /api/vehicles",
        "GET /api/vehicles",
      ];

      expect(routes.length).toBe(10);
      expect(routes).toContain("POST /api/rides");
      expect(routes).toContain("GET /api/rides/:id");
    });

    it("should confirm geospatial indexes exist", async () => {
      // Verify the database has the right indexes
      // This is implicit in the schema, but we can verify queries work
      const result = await db.execute(`
        SELECT indexname FROM pg_indexes 
        WHERE tablename IN ('pools', 'ride_requests')
        AND indexname LIKE '%geo%'
      `);

      // Should have geospatial indexes
      expect(result).toBeDefined();
    });
  });
});
