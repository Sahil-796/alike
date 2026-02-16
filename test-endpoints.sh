#!/bin/bash

echo "🧪 Testing Airport Ride Pooling API Endpoints"
echo "=============================================="
echo ""

BASE_URL="http://localhost:3000"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    
    echo "Testing: $description"
    echo "$method $endpoint"
    
    if [ -n "$data" ]; then
        response=$(curl -s -X $method "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data" \
            -w "\n%{http_code}")
    else
        response=$(curl -s -X $method "$BASE_URL$endpoint" \
            -w "\n%{http_code}")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq 200 ] || [ "$http_code" -eq 201 ]; then
        echo -e "${GREEN}✅ Success ($http_code)${NC}"
        echo "Response: $body" | head -c 200
        echo ""
    else
        echo -e "${RED}❌ Failed ($http_code)${NC}"
        echo "Response: $body"
    fi
    echo ""
}

echo "1. Testing Users Endpoint"
test_endpoint "GET" "/api/users" "" "Get all users"

echo "2. Testing Drivers Endpoint"
test_endpoint "GET" "/api/drivers" "" "Get all drivers"

echo "3. Testing Vehicles Endpoint"
test_endpoint "GET" "/api/vehicles" "" "Get all vehicles"

echo "4. Testing API Documentation"
test_endpoint "GET" "/api-doc" "" "API Documentation page"

echo "=============================================="
echo "✨ Basic endpoint tests complete!"
echo ""
echo "To test ride creation, you need to:"
echo "1. Create a user: POST /api/users"
echo "2. Create a driver: POST /api/drivers"
echo "3. Create a vehicle: POST /api/vehicles"
echo "4. Create a ride: POST /api/rides"
echo ""
echo "See TESTING.md for detailed curl commands"
