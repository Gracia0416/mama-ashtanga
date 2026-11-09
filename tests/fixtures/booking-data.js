const MANAGEMENT_TOKEN = 'a'.repeat(64);

const CONFIRMED_BOOKING = {
  booking_reference: 'MA-TEST123', class_type_name: 'Group Yoga', booking_mode: 'fixed_time',
  starts_at: '2027-01-08T10:00:00Z', ends_at: '2027-01-08T11:00:00Z',
  location: 'Casa Idaman, USJ 5', party_size: 2, total_amount_cents: 8000,
  booking_status: 'confirmed', payment_method: 'duitnow_qr', payment_status: 'unpaid', can_cancel: true,
};

const STUDENTS = {
  default: {name: 'Test Student', email: 'student@example.com', phone: '+60123456789'},
  returning: {name: 'Returning Student', email: 'returning@example.com', phone: '+60123456789'},
};

function groupSession(overrides = {}) {
  return {
    session_id: 'session-1', class_type_slug: 'group', class_type_name: 'Group Yoga',
    booking_mode: 'fixed_time', starts_at: CONFIRMED_BOOKING.starts_at, ends_at: CONFIRMED_BOOKING.ends_at,
    location: CONFIRMED_BOOKING.location, price_per_person_cents: 4000, capacity: 6,
    max_party_size: 6, booked_places: 0, remaining_places: 6, booking_open: true,
    ...overrides,
  };
}

module.exports = {CONFIRMED_BOOKING, MANAGEMENT_TOKEN, STUDENTS, groupSession};
