import { NextRequest, NextResponse } from "next/server";
import { createDriver, getAllDrivers } from "@alike/db/queries/crud";

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
