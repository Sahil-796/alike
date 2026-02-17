// document this !!




// Environment Variables (loaded from .env):
// - PRICING_BASE_FARE: Fixed cost to start any ride (default: $3)
// - PRICING_PER_KM: Cost per kilometer (default: $1.50)
// - PRICING_SEAT_MULTIPLIER: Extra cost per additional seat (default: 1.2x)
// - PRICING_MAX_DISCOUNT: Maximum pooling discount (default: 40%)
// - PRICING_AIRPORT_FEE: Airport pickup/dropoff fee (default: $2)
//
// Pricing Formula Explained:
// ========================
// 
// 1. BASE CALCULATION:
//    Base = Base Fare + (Distance × Per Km Rate × Seat Multiplier) + Airport Fee
//    
//    Example: 20km ride, 2 seats
//    Base = $3 + (20 × $1.50 × 1.2) + $2 = $41
//
// 2. POOLING DISCOUNT:
//    The more people in the pool, the bigger the discount for everyone
//    Discount = Base × (Current Passengers / Max Capacity) × Max Discount
//    
//    Example: 2 passengers in pool of 4
//    Discount = $41 × (2/4) × 0.40 = $8.20 (20% off)
//
// 3. FINAL PRICE:
//    Price = Base - Discount
//    
//    Example: $41 - $8.20 = $32.80
//
// Realistic Scenario:
// ===================
// Solo ride (1 passenger, 20km): $41 (no discount)
// Pool with 2 passengers: $32.80 each (20% off)
// Pool with 4 passengers: $24.60 each (40% off)
// 
// This incentivizes pooling while keeping prices fair!

const PRICING_BASE_FARE = parseFloat(process.env.PRICING_BASE_FARE || "3.0");
const PRICING_PER_KM = parseFloat(process.env.PRICING_PER_KM || "1.5");
const PRICING_SEAT_MULTIPLIER = parseFloat(process.env.PRICING_SEAT_MULTIPLIER || "1.2");
const PRICING_MAX_DISCOUNT = parseFloat(process.env.PRICING_MAX_DISCOUNT || "0.40");
const PRICING_AIRPORT_FEE = parseFloat(process.env.PRICING_AIRPORT_FEE || "2.0");
const PRICING_MAX_PASSENGERS = 4;

export function calculatePrice(
  distanceKm: number,
  seats: number,
  currentPassengers: number,
  isAirportRide: boolean = true
): number {

  const seatFactor = 1 + ((seats - 1) * (PRICING_SEAT_MULTIPLIER - 1));
  const distanceCost = distanceKm * PRICING_PER_KM * seatFactor;
  

  const airportFee = isAirportRide ? PRICING_AIRPORT_FEE : 0;
  const basePrice = PRICING_BASE_FARE + distanceCost + airportFee;

  const poolFullness = currentPassengers / PRICING_MAX_PASSENGERS;
  const discountRate = poolFullness * PRICING_MAX_DISCOUNT;
  const discountAmount = basePrice * discountRate;
  

  const finalPrice = basePrice - discountAmount;
  
  return Math.round(finalPrice * 100) / 100;
}

export function calculateIndividualPrice(
  totalPoolPrice: number,
  passengerSeats: number,
  totalSeats: number
): number {
  
  const proportion = passengerSeats / totalSeats;
  return Math.round((totalPoolPrice * proportion) * 100) / 100;
}

export function getPriceBreakdown(
  distanceKm: number,
  seats: number,
  currentPassengers: number,
  isAirportRide: boolean = true
) {
  const seatFactor = 1 + ((seats - 1) * (PRICING_SEAT_MULTIPLIER - 1));
  const distanceCost = distanceKm * PRICING_PER_KM * seatFactor;
  const airportFee = isAirportRide ? PRICING_AIRPORT_FEE : 0;
  const basePrice = PRICING_BASE_FARE + distanceCost + airportFee;
  
  const poolFullness = currentPassengers / PRICING_MAX_PASSENGERS;
  const discountRate = poolFullness * PRICING_MAX_DISCOUNT;
  const discountAmount = basePrice * discountRate;
  
  return {
    baseFare: PRICING_BASE_FARE,
    distanceCost: Math.round(distanceCost * 100) / 100,
    airportFee,
    subtotal: Math.round(basePrice * 100) / 100,
    discountPercent: Math.round(discountRate * 100),
    discountAmount: Math.round(discountAmount * 100) / 100,
    finalPrice: Math.round((basePrice - discountAmount) * 100) / 100,
  };
}
