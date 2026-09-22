const BOOKING_API_URL = 'https://nvkbobgmrxkjttjvxddl.supabase.co/functions/v1/booking-api';
const MALAYSIA_TIME_ZONE = 'Asia/Kuala_Lumpur';

const bookingExperience = document.getElementById('bookingExperience');
const bookingStatus = document.getElementById('bookingStatus');
const managePanel = document.getElementById('managePanel');
const classButtons = [...document.querySelectorAll('.class-option')];
const calendarPanel = document.getElementById('calendarPanel');
const calendarGrid = document.getElementById('calendarGrid');
const calendarTitle = document.getElementById('calendarTitle');
const detailsPanel = document.getElementById('detailsPanel');
const selectedSessionPanel = document.getElementById('selectedSession');
const confirmationPanel = document.getElementById('confirmationPanel');
const bookingForm = document.getElementById('bookingForm');
const partySize = document.getElementById('partySize');
const preferredTimeField = document.getElementById('preferredTimeField');
const preferredTime = document.getElementById('preferredTime');
const bookingSubmit = document.getElementById('bookingSubmit');

let sessions = [];
let selectedType = null;
let selectedSession = null;
let viewDate = new Date();
viewDate.setDate(1);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function malaysiaDateParts(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MALAYSIA_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(value));
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return {year: Number(get('year')), month: Number(get('month')), day: Number(get('day'))};
}

function dateKey(value) {
  const {year, month, day} = malaysiaDateParts(value);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function prettyDate(value) {
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: MALAYSIA_TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }).format(new Date(value));
}

function sessionTime(session) {
  if (session.booking_mode === 'appointment_request') return 'By appointment';
  const formatter = new Intl.DateTimeFormat('en-MY', {
    timeZone: MALAYSIA_TIME_ZONE, hour: 'numeric', minute: '2-digit'
  });
  return `${formatter.format(new Date(session.starts_at))} to ${formatter.format(new Date(session.ends_at))}`;
}

function money(cents) {
  return cents == null ? 'Price to be confirmed' : `RM ${Math.round(Number(cents) / 100)}`;
}

async function api(path, options = {}) {
  const response = await fetch(`${BOOKING_API_URL}${path}`, {
    ...options,
    headers: {'Content-Type': 'application/json', ...(options.headers || {})},
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
  return body;
}

async function loadSessions() {
  bookingStatus.className = 'container booking-status';
  bookingStatus.textContent = 'Loading live class availability…';
  try {
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 90 * 86400000).toISOString();
    const body = await api(`/sessions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    sessions = body.sessions || [];
    bookingStatus.textContent = sessions.length
      ? 'Live availability is ready. Choose a class to begin.'
      : 'There are no upcoming sessions yet. Please check again soon.';
    bookingStatus.classList.add('success');
    classButtons.forEach((button) => { button.disabled = !sessions.some((session) => session.class_type_slug === button.dataset.type); });
  } catch (error) {
    bookingStatus.innerHTML = `${escapeHtml(error.message)} <button class="text-button" type="button" id="retrySessions">Try again</button>`;
    bookingStatus.classList.add('error');
    document.getElementById('retrySessions')?.addEventListener('click', loadSessions);
  }
}

classButtons.forEach((button) => {
  button.addEventListener('click', () => {
    classButtons.forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    selectedType = button.dataset.type;
    selectedSession = null;
    calendarPanel.classList.remove('booking-muted');
    detailsPanel.className = 'form-panel hidden-until-date';
    selectedSessionPanel.classList.remove('show');
    confirmationPanel.hidden = true;
    const firstSession = sessions.find((session) => session.class_type_slug === selectedType);
    if (firstSession) {
      const parts = malaysiaDateParts(firstSession.starts_at);
      viewDate = new Date(parts.year, parts.month - 1, 1);
    }
    renderCalendar();
    calendarPanel.scrollIntoView({behavior: 'smooth', block: 'start'});
  });
});

function renderCalendar() {
  if (!selectedType) return;
  calendarGrid.innerHTML = '';
  calendarTitle.textContent = new Intl.DateTimeFormat('en-MY', {month: 'long', year: 'numeric'}).format(viewDate);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthSessions = new Map(sessions
    .filter((session) => {
      const parts = malaysiaDateParts(session.starts_at);
      return session.class_type_slug === selectedType && parts.year === year && parts.month === month + 1;
    })
    .map((session) => [dateKey(session.starts_at), session]));

  for (let index = 0; index < firstDay; index += 1) {
    const blank = document.createElement('div');
    blank.className = 'calendar-day outside';
    calendarGrid.appendChild(blank);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const session = monthSessions.get(key);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'calendar-day';
    button.innerHTML = `<span>${day}</span>`;
    const isFull = session && Number(session.remaining_places) < 1;
    if (!session || !session.booking_open) {
      button.disabled = true;
      button.classList.add('not-class-day');
      if (session) button.title = 'Booking closes 24 hours before class';
    } else if (isFull) {
      button.disabled = true;
      button.classList.add('full');
      button.title = 'Fully booked';
    } else {
      button.classList.add('available');
      button.innerHTML += '<span class="dot"></span>';
      button.title = `${session.remaining_places} places remaining`;
      button.addEventListener('click', () => chooseSession(session));
    }
    if (selectedSession && session && selectedSession.session_id === session.session_id) {
      button.classList.remove('available');
      button.classList.add('selected');
    }
    calendarGrid.appendChild(button);
  }
}

function chooseSession(session) {
  selectedSession = session;
  renderCalendar();
  selectedSessionPanel.innerHTML = `
    <strong>${escapeHtml(session.class_type_name)}</strong><br>
    ${escapeHtml(prettyDate(session.starts_at))} · ${escapeHtml(sessionTime(session))}<br>
    <span class="mini">${escapeHtml(session.location)}</span>
    <div class="availability-line"><i class="availability-dot ${Number(session.remaining_places) <= 2 ? 'low' : ''}"></i><span class="seats-left">${session.remaining_places} place${Number(session.remaining_places) === 1 ? '' : 's'} remaining</span></div>
    <div class="session-price"><strong>Class price</strong><span>${escapeHtml(money(session.price_per_person_cents))}</span></div>`;
  selectedSessionPanel.classList.add('show');

  const maxParty = Math.min(Number(session.max_party_size), Number(session.remaining_places));
  partySize.innerHTML = Array.from({length: maxParty}, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join('');
  const appointment = session.booking_mode === 'appointment_request';
  preferredTimeField.hidden = !appointment;
  preferredTime.required = appointment;
  if (!appointment) preferredTime.value = '';
  detailsPanel.className = 'form-panel show';
  document.getElementById('step2')?.classList.add('done');
  document.getElementById('step3')?.classList.add('done');
  setTimeout(() => detailsPanel.scrollIntoView({behavior: 'smooth', block: 'start'}), 180);
}

document.getElementById('prevMonth')?.addEventListener('click', () => {
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
  renderCalendar();
});

document.getElementById('nextMonth')?.addEventListener('click', () => {
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
  renderCalendar();
});

bookingForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedSession || !bookingForm.reportValidity()) return;
  bookingSubmit.disabled = true;
  bookingSubmit.textContent = 'Confirming…';
  bookingStatus.className = 'container booking-status';
  bookingStatus.textContent = 'Checking availability and recording your booking…';
  const requestId = crypto.randomUUID();
  try {
    const body = await api('/bookings', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: selectedSession.session_id,
        name: document.getElementById('name').value.trim(),
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        partySize: Number(partySize.value),
        paymentMethod: bookingForm.elements.paymentMethod.value,
        preferredTime: preferredTime.value || null,
        note: document.getElementById('note').value.trim() || null,
        requestId,
      }),
    });
    const managementUrl = new URL('book.html', window.location.href);
    managementUrl.searchParams.set('token', body.managementToken);
    try { localStorage.setItem('mamaAshtangaLatestBooking', managementUrl.href); } catch { /* The private link remains available below. */ }
    detailsPanel.hidden = true;
    confirmationPanel.hidden = false;
    confirmationPanel.innerHTML = `
      <div class="kicker">Booking confirmed</div>
      <h2>Your mat is reserved.</h2>
      <p class="booking-reference">Reference <strong>${escapeHtml(body.booking.booking_reference)}</strong></p>
      <p>${escapeHtml(prettyDate(body.booking.starts_at))} · ${escapeHtml(sessionTime(body.booking))}</p>
      <div class="management-box"><strong>Save your private management link</strong><p>You need this link to view or cancel your booking. Email delivery is coming later.</p><a href="${escapeHtml(managementUrl.href)}">Manage my booking</a></div>
      <div class="confirmation-actions"><a class="btn" href="${escapeHtml(body.whatsappUrl)}" target="_blank" rel="noopener">Tell Wirni on WhatsApp</a><a class="btn btn-light" href="${escapeHtml(managementUrl.href)}">View booking</a></div>`;
    bookingStatus.textContent = 'Booking successfully recorded in the development database.';
    bookingStatus.classList.add('success');
    confirmationPanel.scrollIntoView({behavior: 'smooth', block: 'start'});
    await loadSessions();
  } catch (error) {
    bookingStatus.textContent = error.message;
    bookingStatus.classList.add('error');
    if (/24 hours|places remain/i.test(error.message)) await loadSessions();
  } finally {
    bookingSubmit.disabled = false;
    bookingSubmit.textContent = 'Confirm booking';
  }
});

async function loadManagedBooking(token) {
  bookingExperience.hidden = true;
  bookingStatus.textContent = 'Loading your booking…';
  managePanel.hidden = false;
  try {
    const {booking} = await api(`/booking?token=${encodeURIComponent(token)}`);
    const status = String(booking.booking_status).replaceAll('_', ' ');
    managePanel.innerHTML = `
      <div class="kicker">Manage booking</div>
      <h2>${escapeHtml(booking.class_type_name)}</h2>
      <dl class="booking-summary"><div><dt>Reference</dt><dd>${escapeHtml(booking.booking_reference)}</dd></div><div><dt>Date</dt><dd>${escapeHtml(prettyDate(booking.starts_at))}</dd></div><div><dt>Time</dt><dd>${escapeHtml(sessionTime(booking))}${booking.preferred_time ? ` · preferred ${escapeHtml(booking.preferred_time.slice(0, 5))}` : ''}</dd></div><div><dt>People</dt><dd>${escapeHtml(booking.party_size)}</dd></div><div><dt>Status</dt><dd>${escapeHtml(status)}</dd></div><div><dt>Payment</dt><dd>${escapeHtml(String(booking.payment_status || 'not applicable').replaceAll('_', ' '))}</dd></div></dl>
      ${booking.can_cancel ? '<div class="field"><label for="cancelReason">Reason for cancellation (optional)</label><textarea id="cancelReason"></textarea></div><button class="btn danger-btn" type="button" id="cancelBooking">Cancel booking</button>' : '<p class="policy-note">Online cancellation is unavailable within 24 hours of class and the booking is non-refundable. Please contact Wirni if you need help.</p>'}
      <div class="confirmation-actions"><a class="btn btn-light" href="book.html">Book another class</a><a class="btn btn-light" href="https://wa.me/60126243655" target="_blank" rel="noopener">Contact Wirni</a></div>`;
    bookingStatus.textContent = 'Your private booking details are shown below.';
    bookingStatus.classList.add('success');
    document.getElementById('cancelBooking')?.addEventListener('click', async () => {
      const cancelButton = document.getElementById('cancelBooking');
      cancelButton.disabled = true;
      cancelButton.textContent = 'Cancelling…';
      try {
        await api('/cancel', {method: 'POST', body: JSON.stringify({token, reason: document.getElementById('cancelReason')?.value.trim() || null})});
        bookingStatus.textContent = 'Your booking has been cancelled and the places are available again.';
        bookingStatus.className = 'container booking-status success';
        await loadManagedBooking(token);
      } catch (error) {
        bookingStatus.textContent = error.message;
        bookingStatus.className = 'container booking-status error';
        cancelButton.disabled = false;
        cancelButton.textContent = 'Cancel booking';
      }
    });
  } catch (error) {
    bookingStatus.textContent = error.message;
    bookingStatus.className = 'container booking-status error';
    managePanel.innerHTML = '<h2>We could not find this booking.</h2><p>The management link may be invalid. Please contact Wirni for help.</p><a class="btn" href="book.html">Return to booking</a>';
  }
}

const managementToken = new URLSearchParams(window.location.search).get('token');
if (managementToken) loadManagedBooking(managementToken);
else loadSessions();
