import { NextRequest, NextResponse } from "next/server";
import { getRideRequestById } from "@alike/db/queries/crud";
import { db, pools, drivers } from "@alike/db";
import { eq } from "drizzle-orm";

/**
 * @swagger
 * /api/rides/{id}:
 *   get:
 *     summary: Get ride details
 *     description: |
 *       Retrieves detailed information about a specific ride including status,
 *       pool assignment, and driver information (if matched).
 *     tags:
 *       - Rides
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Ride ID
 *         example: "84879dcc-055d-47ab-b9a1-e672c6e21cfe"
 *     responses:
 *       200:
 *         description: Ride details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   example: "84879dcc-055d-47ab-b9a1-e672c6e21cfe"
 *                 status:
 *                   type: string
 *                   enum: [pending, matched, confirmed, driver_arrived, ongoing, completed, cancelled]
 *                   example: "matched"
 *                 pickup:
 *                   type: object
 *                   properties:
 *                     address:
 *                       type: string
 *                       example: "123 Main St, New York"
 *                     lat:
 *                       type: string
 *                       example: "40.7500"
 *                     lng:
 *                       type: string
 *                       example: "-74.0000"
 *                 dropoff:
 *                   type: object
 *                   properties:
 *                     address:
 *                       type: string
 *                       example: "JFK Airport Terminal 1"
 *                     lat:
 *                       type: string
 *                       example: "40.6413"
 *                     lng:
 *                       type: string
 *                       example: "-73.7781"
 *                 seats:
 *                   type: integer
 *                   example: 2
 *                 luggage:
 *                   type: integer
 *                   example: 2
 *                 price:
 *                   type: string
 *                   example: "26.25"
 *                 pool:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "17fcab28-bb21-47ef-9622-02ba6e5d61cc"
 *                     status:
 *                       type: string
 *                       enum: [forming, locked, confirmed, driver_assigned, ongoing, completed, cancelled]
 *                       example: "forming"
 *                     filledSeats:
 *                       type: integer
 *                       example: 2
 *                     maxSeats:
 *                       type: integer
 *                       example: 4
 *                     driver:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         rating:
 *                           type: string
 *                           example: "4.8"
 *                         totalRides:
 *                           type: integer
 *                           example: 150
 *                 requestedAt:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-01-15T10:30:00.000Z"
 *                 matchedAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                   example: "2024-01-15T10:32:15.000Z"
 *       404:
 *         description: Ride not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Ride not found"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rideId } = await params;
    
    // Get ride with pool info
    const ride = await getRideRequestById(rideId);
    
    if (!ride) {
      return NextResponse.json(
        { error: "Ride not found" },
        { status: 404 }
      );
    }

    // If ride has pool, get pool and driver details
    let poolInfo = null;
    if (ride.poolId) {
      const [pool] = await db
        .select()
        .from(pools)
        .where(eq(pools.id, ride.poolId));

      if (pool) {
        let driverInfo = null;
        if (pool.driverId) {
          const [driver] = await db
            .select()
            .from(drivers)
            .where(eq(drivers.id, pool.driverId));
          
          driverInfo = driver ? {
            id: driver.id,
            rating: driver.rating,
            totalRides: driver.totalRides,
            // Don't expose exact location for privacy
          } : null;
        }

        poolInfo = {
          id: pool.id,
          status: pool.status,
          filledSeats: pool.filledSeats,
          maxSeats: pool.maxSeats,
          driver: driverInfo,
        };
      }
    }

    return NextResponse.json({
      id: ride.id,
      status: ride.status,
      pickup: {
        address: ride.pickupAddress,
        lat: ride.pickupLat,
        lng: ride.pickupLng,
      },
      dropoff: {
        address: ride.dropoffAddress,
        lat: ride.dropoffLat,
        lng: ride.dropoffLng,
      },
      seats: ride.seats,
      luggage: ride.luggage,
      price: ride.individualPrice,
      pool: poolInfo,
      requestedAt: ride.requestedAt,
      matchedAt: ride.matchedAt,
    });

  } catch (error) {
    console.error("Error fetching ride:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
