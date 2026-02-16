import { NextRequest, NextResponse } from "next/server";
import { db, drivers } from "@alike/db";
import { eq } from "drizzle-orm";

/**
 * @swagger
 * /api/drivers/location:
 *   post:
 *     description: return driver location
 *     responses:
 *       200:
 *         description: success
 *       400:
 *         description: bad request
 *       404:
 *         description: driver not found
 *       500:
 *         description: internal server error
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
