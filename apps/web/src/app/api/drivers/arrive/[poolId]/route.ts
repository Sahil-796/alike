import { NextRequest, NextResponse } from "next/server";
import { driverArrived } from "@alike/db/queries/rides";

/**
 * @swagger
 * /api/drivers/arrive/{poolId}:
 *   post:
 *     summary: Driver arrives at pickup location
 *     description: |
 *       Called when driver reaches the pickup location.
 *       Locks the pool - no more passengers can join.
 *       Confirms all ride requests in the pool.
 *     tags:
 *       - Drivers
 *     parameters:
 *       - in: path
 *         name: poolId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Pool ID
 *         example: "17fcab28-bb21-47ef-9622-02ba6e5d61cc"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - driverId
 *             properties:
 *               driverId:
 *                 type: string
 *                 format: uuid
 *                 description: Driver ID
 *                 example: "b7ce06d8-665a-4949-9ec6-da7ffa13fafb"
 *     responses:
 *       200:
 *         description: Pool locked successfully
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
 *                   example: "Pool locked. No more passengers can join."
 *                 poolId:
 *                   type: string
 *                   format: uuid
 *                   example: "17fcab28-bb21-47ef-9622-02ba6e5d61cc"
 *                 status:
 *                   type: string
 *                   example: "locked"
 *                 passengerCount:
 *                   type: integer
 *                   example: 2
 *       400:
 *         description: Invalid request or pool not in forming state
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Pool is not in forming state"
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
