import { NextRequest, NextResponse } from "next/server";
import { driverArrived } from "@alike/db/queries/rides";

/**
 * @swagger
 * /api/drivers/arrive/{poolId}:
 *   post: 
 *     description: driver arrives at pool
 *     responses:
 *       200:
 *         description: success
 *       400:
 *         description: bad request
 *       500:
 *         description: internal server error
 */
 

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ poolId: string }> }
) {
  try {
    const { poolId } = await params;
    const body = await request.json();
    const { driverId } = body;

    if (!driverId || !poolId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Lock pool when driver arrives
    const result = await driverArrived(poolId, driverId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Pool locked. No more passengers can join.",
      poolId,
      status: "locked",
      passengerCount: result.pool?.filledSeats,
    });

  } catch (error) {
    console.error("Error processing driver arrival:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
