import { NextRequest, NextResponse } from "next/server";
import { getRideRequestById } from "@alike/db/queries/crud";
import { db, pools, drivers } from "@alike/db";
import { eq } from "drizzle-orm";

/**
 * @swagger
 * /api/rides/{rideId}:
 *   get: 
 *     description: get ride details
 *     responses:
 *       200:
 *         description: success
 *       404:
 *         description: not fount
 *       500:
 *         description: internal server error
 */
 

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const rideId = params.id;
    
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
      confirmedAt: ride.confirmedAt,
    });

  } catch (error) {
    console.error("Error fetching ride:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
