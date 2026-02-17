# Testing Guide - Manual Testing Steps

Since automated tests aren't set up, here's how to test manually using curl or Postman:

## Prerequisites
```bash
# 1. Start everything
bun run db:start
bun run db:migrate
bun run queue:start
bun run dev:web      # Terminal 2
```

## Test 1: Create a User
```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Passenger",
    "email": "test@example.com",
    "phone": "+1234567890",
    "role": "passenger"
  }'
```
Save the returned `id` as USER_ID

## Test 2: Create a Driver
```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Driver",
    "email": "driver@example.com",
    "phone": "+0987654321",
    "role": "driver"
  }'
```
Save the returned `id` as DRIVER_USER_ID

## Test 3: Create Driver Profile
```bash
curl -X POST http://localhost:3000/api/drivers \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "DRIVER_USER_ID",
    "status": "available",
    "currentLat": 40.7128,
    "currentLng": -74.0060
  }'
```
Save the returned `id` as DRIVER_ID

## Test 4: Create Vehicle
```bash
curl -X POST http://localhost:3000/api/vehicles \
  -H "Content-Type: application/json" \
  -d '{
    "driverId": "DRIVER_ID",
    "model": "Toyota Camry",
    "licensePlate": "TEST123",
    "maxSeats": 4,
    "maxLuggage": 4
  }'
```

## Test 5: Create Ride (The Main Test!)
```bash
curl -X POST http://localhost:3000/api/rides \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "USER_ID",
    "pickupLat": 40.7500,
    "pickupLng": -74.0000,
    "dropoffLat": 40.6413,
    "dropoffLng": -73.7781,
    "seats": 1,
    "luggage": 1
  }'
```
This should:
- Return immediately with status "pending"
- Show estimated price
- Background worker should match to pool

## Test 6: Check Ride Status
```bash
curl http://localhost:3000/api/rides/RIDE_ID
```

Expected result after a few seconds:
```json
{
  "id": "...",
  "status": "matched",
  "pool": {
    "id": "...",
    "status": "forming",
    "driver": { ... }
  }
}
```

## Test 7: Update Driver Location
```bash
curl -X POST http://localhost:3000/api/drivers/location \
  -H "Content-Type: application/json" \
  -d '{
    "driverId": "DRIVER_ID",
    "lat": 40.7505,
    "lng": -74.0005
  }'
```

## Test 8: Driver Arrives (Locks Pool)
```bash
curl -X POST http://localhost:3000/api/drivers/arrive/POOL_ID \
  -H "Content-Type: application/json" \
  -d '{
    "driverId": "DRIVER_ID"
  }'
```

Expected: Pool status changes to "locked"

## Test 9: Check API Documentation
Open browser:
```
http://localhost:3000/api-doc
```

## Verify Database
Open Drizzle Studio:
```bash
bun run db:studio
```
Then visit: http://localhost:4983

Check that:
- Ride was created with status "matched"
- Pool was created with driver assigned
- Driver status is "assigned"

## Check Redis Queue
```bash
# Connect to Redis
redis-cli

# Check queue length
LLEN bull:ride-matching:wait

# Should be 0 or decreasing as worker processes
```

## Expected Behavior Timeline

**T+0 seconds:** Create ride API returns (instant)
**T+0-2 seconds:** Job added to Redis queue
**T+2-5 seconds:** Worker picks up job, finds/creates pool
**T+5-10 seconds:** Pool created with driver, ride status = "matched"
**T+anytime:** Driver can call arrive endpoint to lock pool

## Common Issues

**"No available drivers"**
- Make sure driver status is "available"
- Check driver has a vehicle
- Driver location should be within 10km of pickup

**"Pool not found"**
- Check rideId is correct
- Wait a few seconds for background processing

**Queue not processing**
- Make sure `bun run queue:start` is running
- Check Redis is running: `redis-cli ping`

## Success Criteria

✅ Ride created successfully  
✅ Price calculated upfront  
✅ Driver assigned automatically  
✅ Pool created with proper capacity  
✅ Driver can update location  
✅ Driver can lock pool on arrival  
✅ Status updates visible in API  
✅ All data persisted in database  

## Next Steps

If all tests pass, your system is working!

Optional load test:
```bash
# Create 10 rides quickly
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/rides \
    -H "Content-Type: application/json" \
    -d "{\"userId\": \"USER_ID\", \"pickupLat\": 40.75, \"pickupLng\": -74.0, \"dropoffLat\": 40.64, \"dropoffLng\": -73.78, \"seats\": 1}"
done
```
