import { NextRequest, NextResponse } from "next/server";
import { db, drivers } from "@alike/db";
import { eq } from "drizzle-orm";

/**
 * @swagger
 * /api/drivers/location:
 *   post:
 *     summary: Update driver GPS location
 *     description: |
 *       Updates the driver's current GPS location.
 *       Should be called every 5-10 seconds by driver app.
 *       Used by system for pool matching and passenger tracking.
 *     tags:
 *       - Drivers
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - driverId
 *               - lat
 *               - lng
 *             properties:
 *               driverId:
 *                 type: string
 *                 format: uuid
 *                 description: Driver ID
 *                 example: "b7ce06d8-665a-4949-9ec6-da7ffa13fafb"
 *               lat:
 *                 type: number
 *                 description: Current latitude
 *                 example: 40.7128
 *               lng:
 *                 type: number
 *                 description: Current longitude
 *                 example: -74.0060
 *     responses:
 *       200:
 *         description: Location updated successfully
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
 *                   example: "Location updated"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-01-15T10:35:22.123Z"
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Missing required fields"
 *       404:
 *         description: Driver not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Driver not found"
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { driverId, lat, lng } = body;

    if (!driverId || lat === undefined || lng === undefined) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Update driver location
    const [driver] = await db
      .update(drivers)
      .set({
        currentLat: lat.toString(),
        currentLng: lng.toString(),
        lastLocationAt: new Date(),
      })
      .where(eq(drivers.id, driverId))
      .returning();

    if (!driver) {
      return NextResponse.json(
        { error: "Driver not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Location updated",
      timestamp: driver.lastLocationAt,
    });

  } catch (error) {
    console.error("Error updating location:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
