import { NextRequest, NextResponse } from "next/server";
import { createDriver, getAllDrivers } from "@alike/db/queries/crud";

/**
 * @swagger
 * /api/drivers:
 *   get:
 *     summary: List all drivers
 *     description: Returns a list of all drivers with their user information
 *     tags:
 *       - Drivers
 *     responses:
 *       200:
 *         description: List of drivers
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                     example: "b7ce06d8-665a-4949-9ec6-da7ffa13fafb"
 *                   userId:
 *                     type: string
 *                     format: uuid
 *                     example: "123e4567-e89b-12d3-a456-426614174000"
 *                   status:
 *                     type: string
 *                     enum: [offline, available, assigned, busy]
 *                     example: "available"
 *                   currentLat:
 *                     type: string
 *                     example: "40.7128"
 *                   currentLng:
 *                     type: string
 *                     example: "-74.0060"
 *                   rating:
 *                     type: string
 *                     example: "4.8"
 *                   totalRides:
 *                     type: integer
 *                     example: 150
 *                   user:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         example: "Mike Driver"
 *                       email:
 *                         type: string
 *                         example: "mike@driver.com"
 *       500:
 *         description: Server error
 *   
 *   post:
 *     summary: Create a driver profile
 *     description: Creates a new driver profile for an existing user
 *     tags:
 *       - Drivers
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *                 description: ID of the user (must have role=driver)
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *               status:
 *                 type: string
 *                 enum: [offline, available, assigned, busy]
 *                 default: available
 *                 example: "available"
 *               currentLat:
 *                 type: number
 *                 description: Initial latitude
 *                 example: 40.7128
 *               currentLng:
 *                 type: number
 *                 description: Initial longitude
 *                 example: -74.0060
 *     responses:
 *       201:
 *         description: Driver created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 userId:
 *                   type: string
 *                   format: uuid
 *                 status:
 *                   type: string
 *                   example: "available"
 *                 currentLat:
 *                   type: string
 *                   example: "40.7128"
 *                 currentLng:
 *                   type: string
 *                   example: "-74.0060"
 *                 rating:
 *                   type: string
 *                   example: "5.0"
 *                 totalRides:
 *                   type: integer
 *                   example: 0
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Server error
 */

export async function GET() {
  try {
    const drivers = await getAllDrivers();
    return NextResponse.json(drivers);
  } catch (error) {
    console.error("Error fetching drivers:", error);
    return NextResponse.json(
      { error: "Failed to fetch drivers" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, status = "available", currentLat, currentLng } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "Missing required field: userId" },
        { status: 400 }
      );
    }

    const driver = await createDriver({
      userId,
      status,
      currentLat: currentLat?.toString(),
      currentLng: currentLng?.toString(),
      lastLocationAt: new Date(),
    });

    if (!driver) {
      return NextResponse.json(
        { error: "Failed to create driver" },
        { status: 500 }
      );
    }

    return NextResponse.json(driver, { status: 201 });
  } catch (error) {
    console.error("Error creating driver:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
