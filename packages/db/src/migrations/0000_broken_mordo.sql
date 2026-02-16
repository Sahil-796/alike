CREATE TYPE "public"."driver_status" AS ENUM('offline', 'available', 'assigned', 'busy');--> statement-breakpoint
CREATE TYPE "public"."pool_status" AS ENUM('forming', 'locked', 'confirmed', 'driver_assigned', 'ongoing', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ride_status" AS ENUM('pending', 'matched', 'confirmed', 'driver_arrived', 'ongoing', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('passenger', 'driver', 'admin');--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "driver_status" DEFAULT 'offline' NOT NULL,
	"current_lat" numeric(10, 8),
	"current_lng" numeric(11, 8),
	"last_location_at" timestamp,
	"rating" numeric(2, 1) DEFAULT '5.0',
	"total_rides" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "drivers_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid,
	"vehicle_id" uuid,
	"max_seats" integer DEFAULT 4 NOT NULL,
	"max_luggage" integer DEFAULT 4 NOT NULL,
	"filled_seats" integer DEFAULT 0 NOT NULL,
	"filled_luggage" integer DEFAULT 0 NOT NULL,
	"waypoints" jsonb,
	"total_distance" numeric(10, 2),
	"estimated_duration" integer,
	"status" "pool_status" DEFAULT 'forming' NOT NULL,
	"base_price" numeric(10, 2),
	"surge_multiplier" numeric(3, 2) DEFAULT '1.00',
	"direction" varchar(20),
	"center_lat" numeric(10, 8),
	"center_lng" numeric(11, 8),
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"locked_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ride_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pool_id" uuid,
	"pickup_address" varchar(500) NOT NULL,
	"pickup_lat" numeric(10, 8) NOT NULL,
	"pickup_lng" numeric(11, 8) NOT NULL,
	"dropoff_address" varchar(500) NOT NULL,
	"dropoff_lat" numeric(10, 8) NOT NULL,
	"dropoff_lng" numeric(11, 8) NOT NULL,
	"direct_distance" numeric(10, 2) NOT NULL,
	"seats" integer DEFAULT 1 NOT NULL,
	"luggage" integer DEFAULT 0 NOT NULL,
	"max_detour_km" numeric(5, 2) DEFAULT '3.00' NOT NULL,
	"status" "ride_status" DEFAULT 'pending' NOT NULL,
	"individual_price" numeric(10, 2),
	"cancelled_at" timestamp,
	"cancellation_reason" varchar(255),
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"matched_at" timestamp,
	"confirmed_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"role" "user_role" DEFAULT 'passenger' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"model" varchar(100),
	"license_plate" varchar(20) NOT NULL,
	"max_seats" integer DEFAULT 4 NOT NULL,
	"max_luggage" integer DEFAULT 4 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_driver_id_unique" UNIQUE("driver_id"),
	CONSTRAINT "vehicles_license_plate_unique" UNIQUE("license_plate")
);
--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drivers_user_id_idx" ON "drivers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "drivers_status_idx" ON "drivers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "drivers_status_location_idx" ON "drivers" USING btree ("status","current_lat","current_lng");--> statement-breakpoint
CREATE INDEX "pools_status_idx" ON "pools" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pools_driver_id_idx" ON "pools" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "pools_status_capacity_idx" ON "pools" USING btree ("status","filled_seats","max_seats");--> statement-breakpoint
CREATE INDEX "pools_created_idx" ON "pools" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pools_direction_idx" ON "pools" USING btree ("direction");--> statement-breakpoint
CREATE INDEX "pools_center_geo_idx" ON "pools" USING gist (point("center_lng", "center_lat"));--> statement-breakpoint
CREATE INDEX "ride_requests_user_id_idx" ON "ride_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ride_requests_pool_id_idx" ON "ride_requests" USING btree ("pool_id");--> statement-breakpoint
CREATE INDEX "ride_requests_status_idx" ON "ride_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ride_requests_status_created_idx" ON "ride_requests" USING btree ("status","requested_at");--> statement-breakpoint
CREATE INDEX "ride_requests_pickup_geo_idx" ON "ride_requests" USING gist (point("pickup_lng", "pickup_lat"));--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_phone_idx" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "vehicles_driver_id_idx" ON "vehicles" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "vehicles_license_plate_idx" ON "vehicles" USING btree ("license_plate");