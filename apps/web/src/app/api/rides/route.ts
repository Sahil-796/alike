import { NextRequest, NextResponse } from "next/server";
import { addRideToQueue } from "@alike/db/events";
import { createRideRequest } from "@alike/db/queries/crud";
import { calculatePrice } from "@/lib/pricing";

/**
 * @swagger
 * /api/rides:
 *   post: 
 *     description: the create ride endpoint. this endpoint creates a new ride request and adds it to the queue. returning the response immediately
 *     responses:
 *       200:
 *         description: success
 *       400:
 *         description: bad request
 *       500:
 *         description: internal server error
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
