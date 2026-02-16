import { db } from "./index";
import { users, drivers, vehicles } from "./schema/schema";

async function seed() {
  console.log("🌱 Seeding database...\n");

  // Create test passengers
  console.log("Creating test passengers...");
  const passenger1 = await db.insert(users).values({
    name: "John Doe",
    email: "john@example.com",
    phone: "+1234567890",
    role: "passenger",
  }).returning();

  const passenger2 = await db.insert(users).values({
    name: "Jane Smith",
    email: "jane@example.com",
    phone: "+1234567891",
    role: "passenger",
  }).returning();

  const passenger3 = await db.insert(users).values({
    name: "Bob Wilson",
    email: "bob@example.com",
    phone: "+1234567892",
    role: "passenger",
  }).returning();

  console.log(`✅ Created ${passenger1.length + passenger2.length + passenger3.length} passengers`);

  // Create test drivers
  console.log("\nCreating test drivers...");
  const driverUser1 = await db.insert(users).values({
    name: "Mike Driver",
    email: "mike@driver.com",
    phone: "+1987654321",
    role: "driver",
  }).returning();

  const driverUser2 = await db.insert(users).values({
    name: "Sarah Driver",
    email: "sarah@driver.com",
    phone: "+1987654322",
    role: "driver",
  }).returning();

  if (!driverUser1[0] || !driverUser2[0]) {
    throw new Error("Failed to create driver users");
  }

  const driver1 = await db.insert(drivers).values({
    userId: driverUser1[0].id,
    status: "available",
    currentLat: "40.7128",
    currentLng: "-74.0060",
    lastLocationAt: new Date(),
    rating: "4.8",
    totalRides: 150,
  }).returning();

  const driver2 = await db.insert(drivers).values({
    userId: driverUser2[0].id,
    status: "available",
    currentLat: "40.7589",
    currentLng: "-73.9851",
    lastLocationAt: new Date(),
    rating: "4.9",
    totalRides: 230,
  }).returning();

  if (!driver1[0] || !driver2[0]) {
    throw new Error("Failed to create drivers");
  }

  console.log(`✅ Created 2 drivers`);

  // Create vehicles
  console.log("\nCreating test vehicles...");
  await db.insert(vehicles).values({
    driverId: driver1[0].id,
    model: "Toyota Camry",
    licensePlate: "NYC-1234",
    maxSeats: 4,
    maxLuggage: 4,
  }).returning();

  await db.insert(vehicles).values({
    driverId: driver2[0].id,
    model: "Honda Odyssey",
    licensePlate: "NYC-5678",
    maxSeats: 6,
    maxLuggage: 6,
  }).returning();

  console.log(`✅ Created 2 vehicles`);

  console.log("\n✨ Seeding complete!");
  console.log("\nTest Data Summary:");
  console.log(`- Passengers: 3`);
  console.log(`- Drivers: 2 (available)`);
  console.log(`- Vehicles: 2 (Sedan + SUV)`);
  console.log("\nYou can now test the API:");
  console.log(`  curl http://localhost:3000/api/users`);
  console.log(`  curl http://localhost:3000/api/drivers`);
  console.log(`  curl http://localhost:3000/api/vehicles`);
  
  process.exit(0);
}

seed().catch((error) => {
  console.error("❌ Seeding failed:", error);
  process.exit(1);
});
