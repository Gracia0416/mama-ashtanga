
const WHATSAPP_NUMBER = '60126243655';

// BUSINESS SETTINGS
// Fill in the real prices later, e.g. group: 35, private: 120.
const CLASS_PRICES = {
  group: null,
  private: null
};

const CLASS_CAPACITY = 6;

// TEMPORARY STATIC DATA FOR GITHUB PAGES
// This simulates how the real backend will work.
// booking count >= 6 means the date becomes grey and unavailable.
//
// Example:
// const BOOKING_COUNTS = {
//   '2026-09-15': 6,
//   '2026-09-17': 4,
// };
//
// IMPORTANT: on a static GitHub Pages site this is NOT shared live between visitors.
// When we connect Supabase, these counts will come from the database automatically.
const BOOKING_COUNTS = {
};

let selectedClass = null;
let selectedDate = null;
let viewDate = new Date();
viewDate.setDate(1);

const classButtons = [...document.querySelectorAll('.class-option')];
const calendarPanel = document.getElementById('calendarPanel');
const calendarGrid = document.getElementById('calendarGrid');
const calendarTitle = document.getElementById('calendarTitle');
const detailsPanel = document.getElementById('detailsPanel');
const selectedSession = document.getElementById('selectedSession');

function formatPrice(type) {
  const value = CLASS_PRICES[type];
  return value == null ? 'Price to be confirmed' : `RM ${Number(value).toFixed(0)}`;
}

document.querySelectorAll('[data-price-display="group"]').forEach(el => {
  el.textContent = formatPrice('group');
});
document.querySelectorAll('[data-price-display="private"]').forEach(el => {
  el.textContent = formatPrice('private');
});

function localISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function prettyDate(date) {
  return new Intl.DateTimeFormat('en-MY', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }).format(date);
}

function bookingCount(iso) {
  return Number(BOOKING_COUNTS[iso] || 0);
}

function seatsLeft(iso) {
  return Math.max(CLASS_CAPACITY - bookingCount(iso), 0);
}

classButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    classButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    selectedClass = {
      type: btn.dataset.type,
      day: Number(btn.dataset.day),
      label: btn.dataset.label,
      time: btn.dataset.time
    };
    selectedDate = null;

    calendarPanel.classList.remove('booking-muted');
    detailsPanel.classList.remove('show');
    detailsPanel.classList.add('hidden-until-date');
    selectedSession.classList.remove('show');

    const now = new Date();
    viewDate = new Date(now.getFullYear(), now.getMonth(), 1);
    renderCalendar();
    calendarPanel.scrollIntoView({behavior:'smooth', block:'start'});
  });
});

function renderCalendar() {
  if (!selectedClass) return;

  calendarGrid.innerHTML = '';
  calendarTitle.textContent = new Intl.DateTimeFormat('en-MY', {
    month:'long', year:'numeric'
  }).format(viewDate);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < startDay; i++) {
    const blank = document.createElement('div');
    blank.className = 'calendar-day outside';
    calendarGrid.appendChild(blank);
  }

  const today = new Date();
  today.setHours(0,0,0,0);

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const iso = localISO(date);
    const isCorrectWeekday = date.getDay() === selectedClass.day;
    const isPast = date < today;
    const count = bookingCount(iso);
    const isFull = selectedClass.type === 'group' && count >= CLASS_CAPACITY;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'calendar-day';
    button.innerHTML = `<span>${day}</span>`;

    if (!isCorrectWeekday || isPast) {
      button.disabled = true;
      button.classList.add('not-class-day');
    } else if (isFull) {
      button.disabled = true;
      button.classList.add('full');
      button.title = 'Fully booked';
    } else {
      button.classList.add('available');
      button.innerHTML += '<span class="dot"></span>';
      button.addEventListener('click', () => selectDate(date));
    }

    if (selectedDate && localISO(selectedDate) === iso) {
      button.classList.remove('available');
      button.classList.add('selected');
    }

    calendarGrid.appendChild(button);
  }
}

function selectDate(date) {
  selectedDate = new Date(date);
  renderCalendar();

  const iso = localISO(selectedDate);
  const remaining = selectedClass.type === 'group' ? seatsLeft(iso) : null;

  selectedSession.innerHTML = `
    <strong>${selectedClass.label}</strong><br>
    ${prettyDate(selectedDate)} · ${selectedClass.time}<br>
    <span class="mini">USJ 5 Padang / Gazebo</span>
    ${selectedClass.type === 'group'
      ? `<div class="availability-line"><i class="availability-dot ${remaining <= 2 ? 'low' : ''}"></i><span class="seats-left">${remaining > 0 ? `${remaining} spot${remaining === 1 ? '' : 's'} available` : 'Fully booked'}</span></div>`
      : ''}
    <div class="session-price">
      <strong>Your class price</strong>
      <span>${formatPrice(selectedClass.type)}</span>
    </div>
  `;
  selectedSession.classList.add('show');

  detailsPanel.classList.remove('hidden-until-date');
  detailsPanel.classList.add('show');
  document.getElementById('step2')?.classList.add('done');
  document.getElementById('step3')?.classList.add('done');

  setTimeout(() => {
    detailsPanel.scrollIntoView({behavior:'smooth', block:'start'});
  }, 180);
}

document.getElementById('prevMonth')?.addEventListener('click', () => {
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
  renderCalendar();
});
document.getElementById('nextMonth')?.addEventListener('click', () => {
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
  renderCalendar();
});

document.getElementById('bookingForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!selectedClass || !selectedDate) return;

  const iso = localISO(selectedDate);

  // Frontend guard. Real enforcement must also exist in the backend.
  if (selectedClass.type === 'group' && bookingCount(iso) >= CLASS_CAPACITY) {
    alert('Sorry, this class is already fully booked. Please choose another date.');
    renderCalendar();
    return;
  }

  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const note = document.getElementById('note').value.trim();

  const message = [
    'Hi Wirni! I would like to book a yoga class 🧘🏻‍♀️',
    '',
    `Name: ${name}`,
    `Phone: ${phone}`,
    `Class: ${selectedClass.label}`,
    `Date: ${prettyDate(selectedDate)}`,
    `Time: ${selectedClass.time}`,
    `Location: USJ 5 Padang / Gazebo`,
    `Price: ${formatPrice(selectedClass.type)}`,
    note ? `Note: ${note}` : ''
  ].filter(Boolean).join('\n');

  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank');
});
