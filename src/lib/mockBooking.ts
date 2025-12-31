import { z } from 'zod';

const bookingSchema = z.object({
  siteId: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  email: z.string().email().max(255),
  slotIso: z.string().datetime(),
  timezone: z.string().min(1),
});

interface Booking {
  id: string;
  siteId?: string;
  name: string;
  email: string;
  slotIso: string;
  timezone: string;
  createdAt: string;
}

const BOOKINGS_KEY = 'vistro_bookings';

function getBookings(): Booking[] {
  try {
    const stored = localStorage.getItem(BOOKINGS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveBookings(bookings: Booking[]): void {
  localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
}

export async function mockBookingApi(body: unknown) {
  // Validate request
  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) {
    return {
      error: parsed.error.errors[0].message,
      status: 400
    };
  }
  
  const { siteId, name, email, slotIso, timezone } = parsed.data;
  
  try {
    // Create booking
    const bookingId = crypto.randomUUID();
    const booking: Booking = {
      id: bookingId,
      siteId,
      name,
      email,
      slotIso,
      timezone,
      createdAt: new Date().toISOString(),
    };
    
    const bookings = getBookings();
    bookings.push(booking);
    saveBookings(bookings);
    
    // TODO: Send email notification
    console.log('TODO: Send booking confirmation email to', email);
    
    return {
      data: { bookingId },
      status: 200
    };
    
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Booking failed',
      status: 500
    };
  }
}

export function getBookingsByEmail(email: string): Booking[] {
  const bookings = getBookings();
  return bookings.filter(b => b.email === email);
}

export function getBookingsBySite(siteId: string): Booking[] {
  const bookings = getBookings();
  return bookings.filter(b => b.siteId === siteId);
}
