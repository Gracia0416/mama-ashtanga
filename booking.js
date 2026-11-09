const BOOKING_API_PROJECT = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? 'wsgfpvajgxjypvmifukv'
  : 'nvkbobgmrxkjttjvxddl';
const BOOKING_API_URL = `https://${BOOKING_API_PROJECT}.supabase.co/functions/v1/booking-api`;
const MALAYSIA_TIME_ZONE = 'Asia/Kuala_Lumpur';

const bookingExperience = document.getElementById('bookingExperience');
const bookingStatus = document.getElementById('bookingStatus');
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
  const displayTime = (value) => formatter.format(new Date(value)).replace(/\b(am|pm)\b/gi, (period) => period.toUpperCase());
  return `${displayTime(session.starts_at)} to ${displayTime(session.ends_at)}`;
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
    if (selectedSession) {
      const refreshedSession = sessions.find((session) => session.session_id === selectedSession.session_id);
      const requestedPlaces = Number(partySize.value || 1);
      if (!refreshedSession || !refreshedSession.booking_open || Number(refreshedSession.remaining_places) < requestedPlaces) {
        selectedSession = null;
        detailsPanel.className = 'form-panel hidden-until-date';
        selectedSessionPanel.classList.remove('show');
      } else {
        selectedSession = refreshedSession;
      }
    }
    if (selectedType) renderCalendar();
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
    const managementUrl = new URL('my-bookings.html', window.location.href);
    managementUrl.hash = `booking=${body.managementToken}`;
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
    if (/24 hours|places remain/i.test(error.message)) await loadSessions();
    bookingStatus.className = 'container booking-status error';
    bookingStatus.textContent = error.message;
  } finally {
    bookingSubmit.disabled = false;
    bookingSubmit.textContent = 'Confirm booking';
  }
});

const managementToken = new URLSearchParams(window.location.search).get('token');
if (managementToken) {
  const target = new URL('my-bookings.html', window.location.href);
  target.hash = `booking=${managementToken}`;
  window.location.replace(target.href);
} else loadSessions();
