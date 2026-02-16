import { NextRequest, NextResponse } from "next/server";
import { createVehicle } from "@alike/db/queries/crud";
import { db } from "@alike/db";
import { vehicles } from "@alike/db/schema";

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
