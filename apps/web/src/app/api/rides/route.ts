import { NextRequest, NextResponse } from "next/server";
import { addRideToQueue } from "@alike/db/events";
import { createRideRequest } from "@alike/db/queries/crud";
import { calculatePrice } from "@/lib/pricing";

/**
 * @swagger
 * /api/rides:
 *   post:
 *     summary: Create a new ride request
 *     description: |
 *       Creates a new ride request and adds it to the background processing queue.
 *       Returns immediately with ride ID and estimated price.
 *       The system will automatically match the ride to a pool and assign a driver.
 *     tags:
 *       - Rides
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - pickupLat
 *               - pickupLng
 *               - dropoffLat
 *               - dropoffLng
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *                 description: ID of the passenger requesting the ride
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *               pickupLat:
 *                 type: number
 *                 description: Pickup latitude
 *                 example: 40.7500
 *               pickupLng:
 *                 type: number
 *                 description: Pickup longitude
 *                 example: -74.0000
 *               dropoffLat:
 *                 type: number
 *                 description: Dropoff latitude
 *                 example: 40.6413
 *               dropoffLng:
 *                 type: number
 *                 description: Dropoff longitude
 *                 example: -73.7781
 *               pickupAddress:
 *                 type: string
 *                 description: Human-readable pickup address
 *                 example: "123 Main St, New York"
 *               dropoffAddress:
 *                 type: string
 *                 description: Human-readable dropoff address
 *                 example: "JFK Airport Terminal 1"
 *               seats:
 *                 type: integer
 *                 description: Number of seats required
 *                 minimum: 1
 *                 maximum: 4
 *                 default: 1
 *                 example: 2
 *               luggage:
 *                 type: integer
 *                 description: Number of luggage bags
 *                 minimum: 0
 *                 default: 0
 *                 example: 2
 *               airportLat:
 *                 type: number
 *                 description: Airport latitude for direction detection
 *                 example: 40.6413
 *               airportLng:
 *                 type: number
 *                 description: Airport longitude for direction detection
 *                 example: -73.7781
 *     responses:
 *       201:
 *         description: Ride created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rideId:
 *                   type: string
 *                   format: uuid
 *                   example: "84879dcc-055d-47ab-b9a1-e672c6e21cfe"
 *                 status:
 *                   type: string
 *                   enum: [pending]
 *                   example: "pending"
 *                 direction:
 *                   type: string
 *                   enum: [airport_to_city, city_to_airport]
 *                   example: "city_to_airport"
 *                 estimatedPrice:
 *                   type: number
 *                   example: 53.1
 *                 message:
 *                   type: string
 *                   example: "Finding your pool and driver..."
 *                 estimatedWaitTime:
 *                   type: string
 *                   example: "2-5 minutes"
 *       400:
 *         description: Invalid request - missing fields or not an airport ride
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Ride must start or end at the airport"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to create ride request"
 */

// Airport coordinates (JFK example - update for your airport)
const AIRPORT_LAT = 40.6413;
const AIRPORT_LNG = -73.7781;
const AIRPORT_RADIUS_KM = 2;

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function detectDirection(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number
): 'airport_to_city' | 'city_to_airport' | null {
  const pickupDist = calculateDistance(pickupLat, pickupLng, AIRPORT_LAT, AIRPORT_LNG);
  const dropoffDist = calculateDistance(dropoffLat, dropoffLng, AIRPORT_LAT, AIRPORT_LNG);
  
  if (pickupDist < AIRPORT_RADIUS_KM) return 'airport_to_city';
  if (dropoffDist < AIRPORT_RADIUS_KM) return 'city_to_airport';
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      pickupAddress,
      pickupLat,
      pickupLng,
      dropoffAddress,
      dropoffLat,
      dropoffLng,
      seats = 1,
      luggage = 0,
      maxDetourKm = 3,
    } = body;

    // Validate required fields
    if (!userId || !pickupLat || !pickupLng || !dropoffLat || !dropoffLng) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Detect direction (airport to city or city to airport)
    const direction = detectDirection(pickupLat, pickupLng, dropoffLat, dropoffLng);
    if (!direction) {
      return NextResponse.json(
        { error: "Ride must start or end at the airport" },
        { status: 400 }
      );
    }

    // Calculate direct distance
    const directDistance = calculateDistance(pickupLat, pickupLng, dropoffLat, dropoffLng);

    // Calculate price (show user upfront)
    const price = calculatePrice(directDistance, seats, 1); // 1 passenger initially

    // 1. Save ride to database with status "pending"
    const ride = await createRideRequest({
      userId,
      pickupAddress: pickupAddress || "Unknown",
      pickupLat: pickupLat.toString(),
      pickupLng: pickupLng.toString(),
      dropoffAddress: dropoffAddress || "Unknown",
      dropoffLat: dropoffLat.toString(),
      dropoffLng: dropoffLng.toString(),
      directDistance: directDistance.toString(),
      seats,
      luggage,
      maxDetourKm: maxDetourKm.toString(),
      status: "pending",
    });

    if (!ride) {
      return NextResponse.json(
        { error: "Failed to create ride request" },
        { status: 500 }
      );
    }

    // 2. Add to queue for background processing (INSTANT - doesn't wait!)
    await addRideToQueue({
      rideId: ride.id,
      userId,
      pickupLat,
      pickupLng,
      dropoffLat,
      dropoffLng,
      seats,
      luggage,
      direction,
    });

    // 3. Return immediately with pending status
    return NextResponse.json({
      rideId: ride.id,
      status: "pending",
      direction,
      estimatedPrice: price,
      message: "Finding your pool and driver...",
      estimatedWaitTime: "2-5 minutes",
    });

  } catch (error) {
    console.error("Error creating ride:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
