export function calculateOptimalDetour(
  existingWaypoints: Waypoint[],
  newPickup: Location,
  newDropoff: Location,
  direction: 'airport_to_city' | 'city_to_airport',
  maxDetourKm: number
): { canAdd: boolean; detourKm: number } {
  
  // case 1: City to airport
  if (direction === 'city_to_airport') {
    return calculateCityToAirportDetour(
      existingWaypoints, 
      newPickup, 
      maxDetourKm
    );
  }
  
  // CASE 2: Airport to City (Same pickup: Airport)  
  if (direction === 'airport_to_city') {
    return calculateAirportToCityDetour(
      existingWaypoints,
      newDropoff,
      maxDetourKm
    );
  }
  
  return { canAdd: false, detourKm: Infinity };
}


function calculateCityToAirportDetour(
  existingWaypoints: Waypoint[],
  newPickup: Location,
  maxDetourKm: number
): { canAdd: boolean; detourKm: number } {
  
  if (existingWaypoints.length === 0) {
    return { canAdd: true, detourKm: 0 };
  }
  
  const pickups = existingWaypoints.filter(w => w.type === 'pickup');
  const airport = existingWaypoints.find(w => w.type === 'dropoff');
  
  if (!airport) {
    return { canAdd: false, detourKm: Infinity };
  }
  
  const currentDistance = calculateRouteDistance(existingWaypoints);
  
  // Try inserting new pickup at EVERY possible position
  // Find the position that adds LEAST distance
  let minNewDistance = Infinity;
  
  for (let i = 0; i <= pickups.length; i++) {
  
    const newWaypoints: Waypoint[] = [
      ...pickups.slice(0, i),
      { lat: newPickup.lat, lng: newPickup.lng, type: 'pickup', sequence: i + 1 },
      ...pickups.slice(i).map((p, idx) => ({ ...p, sequence: i + idx + 2 })),
      airport
    ];
    
    const newDistance = calculateRouteDistance(newWaypoints);
    
    if (newDistance < minNewDistance) {
      minNewDistance = newDistance;
    }
  }
  
  const detourKm = minNewDistance - currentDistance;
  
  return {
    canAdd: detourKm <= maxDetourKm,
    detourKm
  };
}


function calculateAirportToCityDetour(
  existingWaypoints: Waypoint[],
  newDropoff: Location,
  maxDetourKm: number
): { canAdd: boolean; detourKm: number } {
  
  if (existingWaypoints.length === 0) {
    return { canAdd: true, detourKm: 0 };
  }
  
  // Separate airport and dropoffs
  const airport = existingWaypoints.find(w => w.type === 'pickup');
  const dropoffs = existingWaypoints.filter(w => w.type === 'dropoff');
  
  if (!airport) {
    return { canAdd: false, detourKm: Infinity };
  }
  
  // Current route: airport → dropoff1 → dropoff2 → ...
  const currentDistance = calculateRouteDistance(existingWaypoints);
  
  // Try inserting new dropoff at EVERY possible position
  let minNewDistance = Infinity;
  
  for (let i = 0; i <= dropoffs.length; i++) {
    const newWaypoints: Waypoint[] = [
      airport,
      ...dropoffs.slice(0, i),
      { lat: newDropoff.lat, lng: newDropoff.lng, type: 'dropoff', sequence: i + 2 },
      ...dropoffs.slice(i).map((d, idx) => ({ ...d, sequence: i + idx + 3 }))
    ];
    
    const newDistance = calculateRouteDistance(newWaypoints);
    
    if (newDistance < minNewDistance) {
      minNewDistance = newDistance;
    }
  }
  
  const detourKm = minNewDistance - currentDistance;
  
  return {
    canAdd: detourKm <= maxDetourKm,
    detourKm
  };
}

/**
 * Calculate total distance of a route
 */
function calculateRouteDistance(waypoints: Waypoint[]): number {
  if (waypoints.length < 2) return 0;
  
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const prev = waypoints[i - 1];
    const curr = waypoints[i];
    if (prev && curr) {
      total += calculateDistance(prev.lat, prev.lng, curr.lat, curr.lng);
    }
  }
  return total;
}

/**
 * Haversine distance calculation
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Types
export interface Waypoint {
  lat: number;
  lng: number;
  type: 'pickup' | 'dropoff';
  sequence: number;
}

export interface Location {
  lat: number;
  lng: number;
}
