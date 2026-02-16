import { NextRequest, NextResponse } from "next/server";
import { createVehicle } from "@alike/db/queries/crud";
import { db } from "@alike/db";

/**
 * @swagger
 * /api/vehicles:
 *   get:
 *     summary: List all vehicles
 *     description: Returns a list of all vehicles with driver information
 *     tags:
 *       - Vehicles
 *     responses:
 *       200:
 *         description: List of vehicles
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
 *                     example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                   driverId:
 *                     type: string
 *                     format: uuid
 *                     example: "b7ce06d8-665a-4949-9ec6-da7ffa13fafb"
 *                   model:
 *                     type: string
 *                     example: "Toyota Camry"
 *                   licensePlate:
 *                     type: string
 *                     example: "NYC-1234"
 *                   maxSeats:
 *                     type: integer
 *                     example: 4
 *                   maxLuggage:
 *                     type: integer
 *                     example: 4
 *                   driver:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       status:
 *                         type: string
 *                         example: "available"
 *       500:
 *         description: Server error
 *   
 *   post:
 *     summary: Create a vehicle
 *     description: Creates a new vehicle for a driver
 *     tags:
 *       - Vehicles
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - driverId
 *               - licensePlate
 *             properties:
 *               driverId:
 *                 type: string
 *                 format: uuid
 *                 description: Driver ID this vehicle belongs to
 *                 example: "b7ce06d8-665a-4949-9ec6-da7ffa13fafb"
 *               model:
 *                 type: string
 *                 description: Vehicle model/name
 *                 example: "Toyota Camry"
 *               licensePlate:
 *                 type: string
 *                 description: Vehicle license plate number
 *                 example: "NYC-1234"
 *               maxSeats:
 *                 type: integer
 *                 description: Maximum passenger seats
 *                 minimum: 1
 *                 maximum: 8
 *                 default: 4
 *                 example: 4
 *               maxLuggage:
 *                 type: integer
 *                 description: Maximum luggage capacity (bags)
 *                 minimum: 0
 *                 default: 4
 *                 example: 4
 *     responses:
 *       201:
 *         description: Vehicle created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 driverId:
 *                   type: string
 *                   format: uuid
 *                 model:
 *                   type: string
 *                   example: "Toyota Camry"
 *                 licensePlate:
 *                   type: string
 *                   example: "NYC-1234"
 *                 maxSeats:
 *                   type: integer
 *                   example: 4
 *                 maxLuggage:
 *                   type: integer
 *                   example: 4
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Missing required fields: driverId, licensePlate"
 *       500:
 *         description: Server error
 */

export async function GET() {
  try {
    const allVehicles = await db.query.vehicles.findMany({
      with: {
        driver: true,
      },
    });
    return NextResponse.json(allVehicles);
  } catch (error) {
    console.error("Error fetching vehicles:", error);
    return NextResponse.json(
      { error: "Failed to fetch vehicles" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { driverId, model, licensePlate, maxSeats = 4, maxLuggage = 4 } = body;

    if (!driverId || !licensePlate) {
      return NextResponse.json(
        { error: "Missing required fields: driverId, licensePlate" },
        { status: 400 }
      );
    }

    const vehicle = await createVehicle({
      driverId,
      model,
      licensePlate,
      maxSeats,
      maxLuggage,
    });

    if (!vehicle) {
      return NextResponse.json(
        { error: "Failed to create vehicle" },
        { status: 500 }
      );
    }

    return NextResponse.json(vehicle, { status: 201 });
  } catch (error) {
    console.error("Error creating vehicle:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
