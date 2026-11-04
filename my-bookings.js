const BOOKING_API_URL = 'https://nvkbobgmrxkjttjvxddl.supabase.co/functions/v1/booking-api';
const managementStatus = document.getElementById('managementStatus');
const bookingCard = document.getElementById('bookingCard');
const missingLinkPanel = document.getElementById('missingLinkPanel');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const label = (value) => String(value || '').replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
const money = (cents) => cents == null ? 'To be arranged' : new Intl.NumberFormat('en-MY', {style: 'currency', currency: 'MYR'}).format(Number(cents) / 100);
const date = (value) => new Intl.DateTimeFormat('en-MY', {timeZone: 'Asia/Kuala_Lumpur', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'}).format(new Date(value));
const time = (value) => new Intl.DateTimeFormat('en-MY', {timeZone: 'Asia/Kuala_Lumpur', hour: 'numeric', minute: '2-digit'}).format(new Date(value));

function notice(message, error = false) {
  managementStatus.textContent = message;
  managementStatus.className = `booking-status ${error ? 'error' : 'success'}`;
  managementStatus.hidden = !message;
}

async function api(path, body) {
  const response = await fetch(`${BOOKING_API_URL}${path}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'We could not complete that request. Please try again.');
  return data;
}

function paymentDescription(booking) {
  const method = booking.payment_method === 'duitnow_qr' ? 'DuitNow QR' : booking.payment_method === 'cash' ? 'Cash' : 'To be arranged';
  const status = booking.payment_status ? label(booking.payment_status) : 'No payment due yet';
  return {method, status};
}

function renderBooking(booking, token) {
  const payment = paymentDescription(booking);
  const cancelled = String(booking.booking_status).startsWith('cancelled');
  const eligibility = booking.can_cancel
    ? 'Eligible — you can cancel online until 24 hours before class.'
    : cancelled
      ? 'This booking is already cancelled.'
      : 'Online cancellation is closed within 24 hours of class. Please contact Wirni.';
  bookingCard.innerHTML = `
    <div class="booking-card-heading"><div><div class="kicker">Booking reference</div><h2>${escapeHtml(booking.booking_reference)}</h2></div><span class="status-pill">${escapeHtml(label(booking.booking_status))}</span></div>
    <dl class="booking-summary">
      <div><dt>Class</dt><dd>${escapeHtml(booking.class_type_name)}</dd></div>
      <div><dt>Date</dt><dd>${escapeHtml(date(booking.starts_at))}</dd></div>
      <div><dt>Time</dt><dd>${escapeHtml(booking.booking_mode === 'appointment_request' && booking.preferred_time ? `Preferred ${booking.preferred_time.slice(0, 5)}` : time(booking.starts_at))}</dd></div>
      <div><dt>Number of people</dt><dd>${escapeHtml(booking.party_size)}</dd></div>
      <div><dt>Booking status</dt><dd>${escapeHtml(label(booking.booking_status))}</dd></div>
      <div><dt>Total</dt><dd>${escapeHtml(money(booking.total_amount_cents))}</dd></div>
      <div><dt>Payment method</dt><dd>${escapeHtml(payment.method)}</dd></div>
      <div><dt>Payment status</dt><dd>${escapeHtml(payment.status)}</dd></div>
    </dl>
    <p class="policy-note"><strong>Cancellation:</strong> ${escapeHtml(eligibility)}</p>
    <p class="notice">Payment is arranged separately. Selecting cash or DuitNow does not mean payment has been received.</p>
    ${booking.can_cancel ? '<div class="field"><label for="cancelReason">Reason for cancellation (optional)</label><textarea id="cancelReason" maxlength="500"></textarea></div><button class="btn danger-btn" id="cancelBooking" type="button">Cancel booking</button>' : ''}
    <div class="confirmation-actions"><a class="btn btn-light" href="book.html">Book another class</a><a class="btn btn-light" href="https://wa.me/60126243655" target="_blank" rel="noopener noreferrer">Contact Wirni</a></div>`;
  bookingCard.hidden = false;
  missingLinkPanel.hidden = true;
  document.getElementById('cancelBooking')?.addEventListener('click', async () => {
    if (!window.confirm('Cancel this booking and release your place?')) return;
    const button = document.getElementById('cancelBooking');
    button.disabled = true;
    button.textContent = 'Cancelling…';
    try {
      await api('/cancel', {token, reason: document.getElementById('cancelReason')?.value.trim() || null});
      notice('Your booking has been cancelled and its places are available again.');
      await loadBooking(token);
    } catch (error) {
      notice(error.message, true);
      button.disabled = false;
      button.textContent = 'Cancel booking';
    }
  });
}

async function loadBooking(token) {
  notice('Loading your booking…');
  try {
    const {booking} = await api('/booking/view', {token});
    renderBooking(booking, token);
    notice('Your booking details are shown below.');
  } catch (error) {
    sessionStorage.removeItem('mamaSingleBooking');
    notice(error.message, true);
    bookingCard.hidden = true;
    missingLinkPanel.hidden = false;
  }
}

const hash = new URLSearchParams(window.location.hash.slice(1));
const query = new URLSearchParams(window.location.search);
let token = hash.get('booking') || query.get('token');
if (token) {
  history.replaceState(null, '', window.location.pathname);
  try { sessionStorage.setItem('mamaSingleBooking', token); } catch { /* The current page still works. */ }
} else {
  try { token = sessionStorage.getItem('mamaSingleBooking'); } catch { token = null; }
}

if (token) loadBooking(token);
else {
  missingLinkPanel.hidden = false;
  try {
    const latest = localStorage.getItem('mamaAshtangaLatestBooking');
    if (latest) {
      document.getElementById('latestBookingLink').href = latest;
      document.getElementById('latestBookingAction').hidden = false;
    }
  } catch { /* The page still shows recovery instructions. */ }
}
