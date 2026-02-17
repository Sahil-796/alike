import { 
  pgTable, 
  uuid, 
  varchar, 
  timestamp, 
  integer, 
  decimal,
  pgEnum,
  index,
  jsonb,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ============================================================================
// ENUMS
// ============================================================================

export const userRoleEnum = pgEnum('user_role', ['passenger', 'driver', 'admin']);
export const rideStatusEnum = pgEnum('ride_status', [
  'pending',           // Searching for pool
  'matched',           // Found pool, driver assigned
  'driver_arrived',    // Driver at pickup location
  'ongoing',           // Ride in progress
  'completed', 
  'cancelled'
]);
export const poolStatusEnum = pgEnum('pool_status', [
  'forming',           // Accepting passengers
  'driver_assigned',   // Driver matched, can still add passengers
  'driver_arrived',    // Driver at pickup, pool locked
  'ongoing',           // Ride in progress
  'completed',
  'cancelled'
]);
export const driverStatusEnum = pgEnum('driver_status', [
  'offline',
  'available',    // Ready for assignment
  'assigned',     // Has a pool
  'busy'          // On a ride
]);

// ============================================================================
// USERS (Passengers & Drivers)
// ============================================================================

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  phone: varchar('phone', { length: 20 }).notNull().unique(),
  role: userRoleEnum('role').notNull().default('passenger'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('users_email_idx').on(table.email),
  index('users_phone_idx').on(table.phone),
  index('users_role_idx').on(table.role),
]);

// ============================================================================
// DRIVERS (Additional driver-specific info)
// ============================================================================

export const drivers = pgTable('drivers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  
  // Current status
  status: driverStatusEnum('status').notNull().default('offline'),
  currentLat: decimal('current_lat', { precision: 10, scale: 8 }),
  currentLng: decimal('current_lng', { precision: 11, scale: 8 }),
  lastLocationAt: timestamp('last_location_at'),
  
  // Ratings
  rating: decimal('rating', { precision: 2, scale: 1 }).default('5.0'),
  totalRides: integer('total_rides').default(0),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('drivers_user_id_idx').on(table.userId),
  index('drivers_status_idx').on(table.status),
  index('drivers_status_location_idx').on(table.status, table.currentLat, table.currentLng),
]);

// ============================================================================
// VEHICLES (Capacity constraints)
// ============================================================================

export const vehicles = pgTable('vehicles', {
  id: uuid('id').primaryKey().defaultRandom(),
  driverId: uuid('driver_id')
    .references(() => drivers.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  
  // Vehicle details
  model: varchar('model', { length: 100 }),
  licensePlate: varchar('license_plate', { length: 20 }).notNull().unique(),
  
  // Capacity constraints (CRITICAL for pooling)
  maxSeats: integer('max_seats').notNull().default(4),
  maxLuggage: integer('max_luggage').notNull().default(4), // in standard bags
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('vehicles_driver_id_idx').on(table.driverId),
  index('vehicles_license_plate_idx').on(table.licensePlate),
]);

// ============================================================================
// POOLS (Shared ride container)
// ============================================================================

export const pools = pgTable('pools', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Assigned driver & vehicle (NULL until confirmed)
  driverId: uuid('driver_id')
    .references(() => drivers.id, { onDelete: 'set null' }),
  vehicleId: uuid('vehicle_id')
    .references(() => vehicles.id, { onDelete: 'set null' }),
  
  // Capacity tracking (MUST respect vehicle constraints)
  maxSeats: integer('max_seats').notNull().default(4),
  maxLuggage: integer('max_luggage').notNull().default(4),
  filledSeats: integer('filled_seats').notNull().default(0),
  filledLuggage: integer('filled_luggage').notNull().default(0),
  
  // Route optimization data
  // waypoints: ordered list of stops [pickup1, pickup2, dropoff1, dropoff2, ...]
  waypoints: jsonb('waypoints').$type<Array<{
    lat: number;
    lng: number;
    type: 'pickup' | 'dropoff';
    rideRequestId: string;
    sequence: number;
  }>>(),
  
  // Total route metrics
  totalDistance: decimal('total_distance', { precision: 10, scale: 2 }), // km
  estimatedDuration: integer('estimated_duration'), // minutes
  
  // Status & Pricing
  status: poolStatusEnum('status').notNull().default('forming'),
  basePrice: decimal('base_price', { precision: 10, scale: 2 }),
  surgeMultiplier: decimal('surge_multiplier', { precision: 3, scale: 2 }).default('1.00'),
  
  // Direction: 'airport_to_city' or 'city_to_airport'
  direction: varchar('direction', { length: 20 }),
  
  // Pool center for geospatial matching (calculated from waypoints)
  centerLat: decimal('center_lat', { precision: 10, scale: 8 }),
  centerLng: decimal('center_lng', { precision: 11, scale: 8 }),
  
  // Concurrency control (for optimistic locking)
  version: integer('version').notNull().default(0),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lockedAt: timestamp('locked_at'), // When pool stops accepting new riders
  driverArrivedAt: timestamp('driver_arrived_at'), // When driver reaches pickup
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
}, (table) => [
  index('pools_status_idx').on(table.status),
  index('pools_driver_id_idx').on(table.driverId),
  index('pools_status_capacity_idx').on(table.status, table.filledSeats, table.maxSeats),
  index('pools_created_idx').on(table.createdAt),
  index('pools_direction_idx').on(table.direction),
  // Geospatial index for pool center (for finding nearby pools)
  index('pools_center_geo_idx').using(
    'gist',
    sql`point(${table.centerLng}, ${table.centerLat})`
  ),
]);

// ============================================================================
// RIDE REQUESTS (Individual bookings)
// ============================================================================

export const rideRequests = pgTable('ride_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Foreign keys
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  poolId: uuid('pool_id')
    .references(() => pools.id, { onDelete: 'set null' }),
  
  // Pickup location
  pickupAddress: varchar('pickup_address', { length: 500 }).notNull(),
  pickupLat: decimal('pickup_lat', { precision: 10, scale: 8 }).notNull(),
  pickupLng: decimal('pickup_lng', { precision: 11, scale: 8 }).notNull(),
  
  // Dropoff location
  dropoffAddress: varchar('dropoff_address', { length: 500 }).notNull(),
  dropoffLat: decimal('dropoff_lat', { precision: 10, scale: 8 }).notNull(),
  dropoffLng: decimal('dropoff_lng', { precision: 11, scale: 8 }).notNull(),
  
  // Direct distance (for calculating detour)
  directDistance: decimal('direct_distance', { precision: 10, scale: 2 }).notNull(), // km
  
  // Constraints (CRITICAL for pooling)
  seats: integer('seats').notNull().default(1),
  luggage: integer('luggage').notNull().default(0), // number of bags
  maxDetourKm: decimal('max_detour_km', { precision: 5, scale: 2 }).notNull().default('3.00'), // max extra km
  
  // Status & Pricing
  status: rideStatusEnum('status').notNull().default('pending'),
  individualPrice: decimal('individual_price', { precision: 10, scale: 2 }),
  
  // Cancellation tracking
  cancelledAt: timestamp('cancelled_at'),
  cancellationReason: varchar('cancellation_reason', { length: 255 }),
  
  // Timestamps
  requestedAt: timestamp('requested_at').defaultNow().notNull(),
  matchedAt: timestamp('matched_at'),
  driverArrivedAt: timestamp('driver_arrived_at'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
}, (table) => [
  index('ride_requests_user_id_idx').on(table.userId),
  index('ride_requests_pool_id_idx').on(table.poolId),
  index('ride_requests_status_idx').on(table.status),
  index('ride_requests_status_created_idx').on(table.status, table.requestedAt),
  // Geospatial index for finding nearby pickups (PostGIS)
  index('ride_requests_pickup_geo_idx').using(
    'gist',
    sql`point(${table.pickupLng}, ${table.pickupLat})`
  ),
]);

// ============================================================================
// RELATIONS
// ============================================================================

export const usersRelations = relations(users, ({ one, many }) => ({
  driver: one(drivers),
  rideRequests: many(rideRequests),
}));

export const driversRelations = relations(drivers, ({ one, many }) => ({
  user: one(users, {
    fields: [drivers.userId],
    references: [users.id],
  }),
  vehicle: one(vehicles),
  pools: many(pools),
}));

export const vehiclesRelations = relations(vehicles, ({ one }) => ({
  driver: one(drivers, {
    fields: [vehicles.driverId],
    references: [drivers.id],
  }),
}));

export const poolsRelations = relations(pools, ({ one, many }) => ({
  driver: one(drivers, {
    fields: [pools.driverId],
    references: [drivers.id],
  }),
  vehicle: one(vehicles, {
    fields: [pools.vehicleId],
    references: [vehicles.id],
  }),
  rideRequests: many(rideRequests),
}));

export const rideRequestsRelations = relations(rideRequests, ({ one }) => ({
  user: one(users, {
    fields: [rideRequests.userId],
    references: [users.id],
  }),
  pool: one(pools, {
    fields: [rideRequests.poolId],
    references: [pools.id],
  }),
}));

// ============================================================================
// TYPES
// ============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Driver = typeof drivers.$inferSelect;
export type NewDriver = typeof drivers.$inferInsert;
export type Vehicle = typeof vehicles.$inferSelect;
export type NewVehicle = typeof vehicles.$inferInsert;
export type Pool = typeof pools.$inferSelect;
export type NewPool = typeof pools.$inferInsert;
export type RideRequest = typeof rideRequests.$inferSelect;
export type NewRideRequest = typeof rideRequests.$inferInsert;

