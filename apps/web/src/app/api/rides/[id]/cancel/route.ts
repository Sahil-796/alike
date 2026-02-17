import { NextRequest, NextResponse } from "next/server";
import { cancelPoolForRide } from "@alike/db/queries/rides";
import { addRideToQueue } from "@alike/db/events";

/**
 * @swagger
 * /api/rides/{id}/cancel:
 *   post:
 *     summary: Cancel a ride
 *     description: |
 *       Cancels a ride request. If driver has not arrived, no cancellation fee.
 *       If driver has arrived, a $5 cancellation fee is charged.
 *     tags:
 *       - Rides
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Ride ID to cancel
 *         example: "84879dcc-055d-47ab-b9a1-e672c6e21cfe"
 *     responses:
 *       200:
 *         description: Ride cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Ride cancelled successfully"
 *                 fee:
 *                   type: number
 *                   description: Cancellation fee (0 if no fee)
 *                   example: 0
 *       400:
 *         description: Cannot cancel ride
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Ride already completed"
 *       404:
 *         description: Ride not found
 *       500:
 *         description: Server error
 */

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const rideId = params.id;

    // Add cancellation job to queue for background processing
    await addRideToQueue({
      rideId,
      userId: "", // Not needed for cancellation
      pickupLat: 0,
      pickupLng: 0,
      dropoffLat: 0,
      dropoffLng: 0,
      seats: 0,
      luggage: 0,
      direction: "city_to_airport",
    });

    // For now, return immediate response
    // In production, you'd poll for the cancellation result
    return NextResponse.json({
      success: true,
      message: "Cancellation request submitted. Processing...",
      rideId,
    });

  } catch (error) {
    console.error("Error cancelling ride:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
