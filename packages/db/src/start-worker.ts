import { startRideWorker } from "./events.js";

console.log("🚀 Starting ride matching worker...");
console.log("📡 Connected to Redis queue");
console.log("⏳ Waiting for jobs...\n");

const worker = startRideWorker();

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down worker...");
  worker.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Shutting down worker...");
  worker.close();
  process.exit(0);
});
