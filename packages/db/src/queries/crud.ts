// - User CRUD: createUser, getUserById, updateUser, deleteUser
// - Driver CRUD: createDriver, getDriverById, updateDriverStatus
// - Ride CRUD: createRideRequest, getRideRequestById, cancelRideRequest
// - Pool CRUD: createPool, getPoolById, updatePoolStatus, deletePool


import { eq } from "drizzle-orm";
import { db } from "../index";
import { 
  users, 
  rideRequests, 
  pools, 
  drivers,
  vehicles,
  type NewUser,
  type NewRideRequest,
  type NewPool,
  type NewDriver,
  type NewVehicle,
  type User,
  type RideRequest,
  type Pool,
  type Driver,
  type Vehicle,
} from "../schema/schema";

// ============================================================================
// USER CRUD
// ============================================================================

export async function createUser(data: NewUser): Promise<User | undefined> {
  const [user] = await db.insert(users).values(data).returning();
  return user;
}

export async function getUserById(id: string): Promise<User | undefined> {
  return db.query.users.findFirst({
    where: eq(users.id, id),
  });
}

export async function getAllUsers(): Promise<User[]> {
  return db.query.users.findMany();
}

export async function updateUser(id: string, data: Partial<NewUser>): Promise<User | undefined> {
  const [user] = await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return user;
}

export async function deleteUser(id: string): Promise<User | undefined> {
  const [user] = await db.delete(users).where(eq(users.id, id)).returning();
  return user;
}

// ============================================================================
// DRIVER CRUD
// ============================================================================

export async function createDriver(data: NewDriver): Promise<Driver | undefined> {
  const [driver] = await db.insert(drivers).values(data).returning();
  return driver;
}

export async function getDriverById(id: string): Promise<Driver | undefined> {
  return db.query.drivers.findFirst({
    where: eq(drivers.id, id),
    with: {
      user: true,
      vehicle: true,
    },
  });
}

export async function getAllDrivers(): Promise<Driver[]> {
  return db.query.drivers.findMany({
    with: {
      user: true,
    },
  });
}

export async function updateDriverStatus(id: string, status: Driver["status"]): Promise<Driver | undefined> {
  const [driver] = await db
    .update(drivers)
    .set({ status })
    .where(eq(drivers.id, id))
    .returning();
  return driver;
}

// ============================================================================
// RIDE REQUEST CRUD
// ============================================================================

export async function createRideRequest(data: NewRideRequest): Promise<RideRequest | undefined> {
  const [request] = await db.insert(rideRequests).values(data).returning();
  return request;
}

export async function getRideRequestById(id: string): Promise<RideRequest | undefined> {
  return db.query.rideRequests.findFirst({
    where: eq(rideRequests.id, id),
    with: {
      user: true,
      pool: true,
    },
  });
}

export async function getAllRideRequests(): Promise<RideRequest[]> {
  return db.query.rideRequests.findMany({
    with: {
      user: true,
    },
  });
}

export async function getRideRequestsByUser(userId: string): Promise<RideRequest[]> {
  return db.query.rideRequests.findMany({
    where: eq(rideRequests.userId, userId),
    orderBy: [rideRequests.requestedAt],
  });
}

export async function updateRideRequestStatus(
  id: string, 
  status: RideRequest["status"]
): Promise<RideRequest | undefined> {
  const updates: Partial<RideRequest> = { status };
  
  if (status === "matched") updates.matchedAt = new Date();
  if (status === "confirmed") updates.confirmedAt = new Date();
  if (status === "ongoing") updates.startedAt = new Date();
  if (status === "completed") updates.completedAt = new Date();
  if (status === "cancelled") updates.cancelledAt = new Date();
  
  const [request] = await db
    .update(rideRequests)
    .set(updates)
    .where(eq(rideRequests.id, id))
    .returning();
  
  return request;
}

export async function cancelRideRequest(id: string, reason?: string): Promise<RideRequest | undefined> {
  const [request] = await db
    .update(rideRequests)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancellationReason: reason || null,
    })
    .where(eq(rideRequests.id, id))
    .returning();
  return request;
}

// ============================================================================
// POOL CRUD
// ============================================================================

export async function createPool(data: NewPool): Promise<Pool | undefined> {
  const [pool] = await db.insert(pools).values(data).returning();
  return pool;
}

export async function getPoolById(id: string): Promise<Pool | undefined> {
  return db.query.pools.findFirst({
    where: eq(pools.id, id),
    with: {
      rideRequests: {
        with: {
          user: true,
        },
      },
      driver: {
        with: {
          user: true,
        },
      },
    },
  });
}

export async function getAllPools(): Promise<Pool[]> {
  return db.query.pools.findMany({
    with: {
      rideRequests: true,
    },
  });
}

export async function getPoolsByStatus(status: Pool["status"]): Promise<Pool[]> {
  return db.query.pools.findMany({
    where: eq(pools.status, status),
    orderBy: [pools.createdAt],
  });
}

export async function updatePoolStatus(id: string, status: Pool["status"]): Promise<Pool | undefined> {
  const updates: Partial<Pool> = { status };
  
  if (status === "locked") updates.lockedAt = new Date();
  if (status === "ongoing") updates.startedAt = new Date();
  if (status === "completed") updates.completedAt = new Date();
  
  const [pool] = await db
    .update(pools)
    .set(updates)
    .where(eq(pools.id, id))
    .returning();
  
  return pool;
}

export async function deletePool(id: string): Promise<Pool | undefined> {
  const [pool] = await db.delete(pools).where(eq(pools.id, id)).returning();
  return pool;
}

// ============================================================================
// VEHICLE CRUD
// ============================================================================

export async function createVehicle(data: NewVehicle): Promise<Vehicle | undefined> {
  const [vehicle] = await db.insert(vehicles).values(data).returning();
  return vehicle;
}

export async function getVehicleById(id: string): Promise<Vehicle | undefined> {
  return db.query.vehicles.findFirst({
    where: eq(vehicles.id, id),
    with: {
      driver: true,
    },
  });
}

export async function getVehicleByDriverId(driverId: string): Promise<Vehicle | undefined> {
  return db.query.vehicles.findFirst({
    where: eq(vehicles.driverId, driverId),
  });
}

export async function getAllVehicles(): Promise<Vehicle[]> {
  return db.query.vehicles.findMany({
    with: {
      driver: true,
    },
  });
}

export async function updateVehicle(id: string, data: Partial<NewVehicle>): Promise<Vehicle | undefined> {
  const [vehicle] = await db
    .update(vehicles)
    .set(data)
    .where(eq(vehicles.id, id))
    .returning();
  return vehicle;
}

export async function deleteVehicle(id: string): Promise<Vehicle | undefined> {
  const [vehicle] = await db.delete(vehicles).where(eq(vehicles.id, id)).returning();
  return vehicle;
}
