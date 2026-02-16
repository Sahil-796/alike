// Simple pricing calculator
export function calculatePrice(
  distanceKm: number,
  seats: number,
  currentPassengers: number,
  baseRate: number = 2.5, // $ per km
  baseFare: number = 5.0   // Base fare
): number {
  // Base price for the ride
  const basePrice = baseFare + (distanceKm * baseRate * seats);
  
  // Pooling discount: more passengers = bigger discount
  // Max discount 50% when pool is full (4 passengers)
  const maxPassengers = 4;
  const discountPercent = (currentPassengers / maxPassengers) * 0.5;
  const discount = basePrice * discountPercent;
  
  return Math.round((basePrice - discount) * 100) / 100;
}

export function calculateIndividualPrice(
  totalPoolPrice: number,
  passengerSeats: number,
  totalSeats: number
): number {
  // Fair split based on seats occupied
  return Math.round((totalPoolPrice * (passengerSeats / totalSeats)) * 100) / 100;
}
