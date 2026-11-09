const {test, expect} = require('@playwright/test');

const token = 'a'.repeat(64);
const booking = {
  booking_reference: 'MA-TEST123',
  class_type_name: 'Group Yoga',
  booking_mode: 'fixed_time',
  starts_at: '2027-01-08T10:00:00Z',
  ends_at: '2027-01-08T11:00:00Z',
  location: 'Casa Idaman, USJ 5',
  party_size: 2,
  total_amount_cents: 8000,
  booking_status: 'confirmed',
  payment_method: 'duitnow_qr',
  payment_status: 'unpaid',
  can_cancel: true,
};

test('student books two places, manages the booking and cancels', async ({page}) => {
  let currentBooking = {...booking};
  let submittedBooking;
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());

  await page.route('**/functions/v1/booking-api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.split('/booking-api')[1];
    const input = request.method() === 'POST' ? request.postDataJSON() : null;

    if (path === '/sessions') {
      return route.fulfill({json: {sessions: [{
        session_id: 'session-1', class_type_slug: 'group', class_type_name: 'Group Yoga',
        booking_mode: 'fixed_time', starts_at: booking.starts_at, ends_at: booking.ends_at,
        location: booking.location, price_per_person_cents: 4000, capacity: 6,
        max_party_size: 6, booked_places: 0, remaining_places: 6, booking_open: true,
      }]}});
    }
    if (path === '/bookings') {
      submittedBooking = input;
      return route.fulfill({status: 201, json: {
        booking: currentBooking,
        managementToken: token,
        whatsappUrl: 'https://wa.me/60126243655',
      }});
    }
    if (path === '/booking/view') {
      expect(input.token).toBe(token);
      return route.fulfill({json: {booking: currentBooking}});
    }
    if (path === '/cancel') {
      expect(input.token).toBe(token);
      currentBooking = {...currentBooking, booking_status: 'cancelled_by_customer', can_cancel: false};
      return route.fulfill({json: {cancellation: {booking_status: 'cancelled_by_customer'}}});
    }
    return route.abort();
  });

  await page.goto('/book.html');
  await page.getByRole('button', {name: /Friday/}).click();
  await page.locator('.calendar-day.available').click();
  await page.locator('#name').fill('Test Student');
  await page.locator('#email').fill('student@example.com');
  await page.locator('#phone').fill('+60123456789');
  await page.locator('#partySize').selectOption('2');
  await page.getByLabel('DuitNow QR').check();
  await page.getByRole('button', {name: 'Confirm booking'}).click();

  await expect(page.getByRole('heading', {name: 'Your mat is reserved.'})).toBeVisible();
  await expect(page.getByText('MA-TEST123')).toBeVisible();
  expect(submittedBooking.partySize).toBe(2);
  expect(submittedBooking.paymentMethod).toBe('duitnow_qr');

  await page.getByRole('link', {name: 'View booking'}).click();
  await expect(page.getByText('MA-TEST123')).toBeVisible();
  await expect(page.getByText('6:00 PM')).toBeVisible();
  await expect(page.getByText('DuitNow QR')).toBeVisible();
  await expect(page.getByText('Unpaid')).toBeVisible();
  await expect(page.getByText('Eligible', {exact: false})).toBeVisible();
  await expect(page).toHaveURL(/my-bookings\.html$/);

  await page.getByRole('button', {name: 'Cancel booking'}).click();
  await expect(page.locator('.status-pill')).toContainText('Cancelled by customer');
  await expect(page.getByRole('button', {name: 'Cancel booking'})).toHaveCount(0);
  await expect(page.getByRole('link', {name: 'Contact Wirni'})).toBeVisible();
  const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')]
    .map((element) => ({element: `${element.tagName.toLowerCase()}.${element.className}`, right: Math.round(element.getBoundingClientRect().right), width: Math.round(element.getBoundingClientRect().width)}))
    .filter((item) => item.right > innerWidth + 1));
  expect(overflow).toEqual([]);
  expect(browserErrors).toEqual([]);
});

test('a class that fills while booking refuses the extra booking', async ({page}) => {
  let remainingPlaces = 1;

  await page.route('**/functions/v1/booking-api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.split('/booking-api')[1];
    if (path.startsWith('/sessions')) {
      return route.fulfill({json: {sessions: [{
        session_id: 'last-place-session', class_type_slug: 'group', class_type_name: 'Group Yoga',
        booking_mode: 'fixed_time', starts_at: booking.starts_at, ends_at: booking.ends_at,
        location: booking.location, price_per_person_cents: 4000, capacity: 6,
        max_party_size: 6, booked_places: 6 - remainingPlaces,
        remaining_places: remainingPlaces, booking_open: true,
      }]}});
    }
    if (path === '/bookings') {
      remainingPlaces = 0;
      return route.fulfill({status: 409, json: {error: 'Only 0 places remain for this class.'}});
    }
    return route.abort();
  });

  await page.goto('/book.html');
  await page.getByRole('button', {name: /Friday/}).click();
  await page.locator('.calendar-day.available').click();
  await expect(page.locator('#partySize option')).toHaveCount(1);
  await page.locator('#name').fill('Test Student');
  await page.locator('#email').fill('student@example.com');
  await page.locator('#phone').fill('+60123456789');
  await page.getByLabel('Cash').check();
  await page.getByRole('button', {name: 'Confirm booking'}).click();

  await expect(page.getByText('Only 0 places remain for this class.')).toBeVisible();
  await expect(page.locator('.calendar-day.full')).toHaveAttribute('title', 'Fully booked');
  await expect(page.locator('.calendar-day.available')).toHaveCount(0);
  await expect(page.getByRole('heading', {name: 'Your mat is reserved.'})).toHaveCount(0);
});

test('website shows a duplicate-booking rejection returned by the API', async ({page}) => {
  await page.route('**/functions/v1/booking-api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.split('/booking-api')[1];
    if (path.startsWith('/sessions')) {
      return route.fulfill({json: {sessions: [{
        session_id: 'session-1', class_type_slug: 'group', class_type_name: 'Group Yoga',
        booking_mode: 'fixed_time', starts_at: booking.starts_at, ends_at: booking.ends_at,
        location: booking.location, price_per_person_cents: 4000, capacity: 6,
        max_party_size: 6, booked_places: 1, remaining_places: 5, booking_open: true,
      }]}});
    }
    if (path === '/bookings') {
      return route.fulfill({status: 409, json: {
        error: 'You already have an active booking for this class.',
      }});
    }
    return route.abort();
  });

  await page.goto('/book.html');
  await page.getByRole('button', {name: /Friday/}).click();
  await page.locator('.calendar-day.available').click();
  await page.locator('#name').fill('Returning Student');
  await page.locator('#email').fill('returning@example.com');
  await page.locator('#phone').fill('+60123456789');
  await page.getByLabel('Cash').check();
  await page.getByRole('button', {name: 'Confirm booking'}).click();

  await expect(page.getByText('You already have an active booking for this class.')).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Your mat is reserved.'})).toHaveCount(0);
});

test('booking inside the 24-hour window cannot be cancelled online', async ({page}) => {
  let cancellationRequests = 0;
  const lateBooking = {...booking, can_cancel: false};

  await page.route('**/functions/v1/booking-api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.split('/booking-api')[1];
    if (path === '/booking/view') {
      expect(request.postDataJSON().token).toBe(token);
      return route.fulfill({json: {booking: lateBooking}});
    }
    if (path === '/cancel') {
      cancellationRequests += 1;
      return route.fulfill({status: 409, json: {error: 'Cancellation closes 24 hours before class.'}});
    }
    return route.abort();
  });

  await page.goto(`/my-bookings.html#booking=${token}`);
  await expect(page.getByText('Online cancellation is closed within 24 hours of class.')).toBeVisible();
  await expect(page.getByRole('button', {name: 'Cancel booking'})).toHaveCount(0);
  await expect(page.getByRole('link', {name: 'Contact Wirni'})).toBeVisible();
  expect(cancellationRequests).toBe(0);
});

test('student closes the site and reopens the latest booking in the same browser', async ({context, page}) => {
  await context.route('**/functions/v1/booking-api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.split('/booking-api')[1];
    if (path.startsWith('/sessions')) {
      return route.fulfill({json: {sessions: [{
        session_id: 'session-1', class_type_slug: 'group', class_type_name: 'Group Yoga',
        booking_mode: 'fixed_time', starts_at: booking.starts_at, ends_at: booking.ends_at,
        location: booking.location, price_per_person_cents: 4000, capacity: 6,
        max_party_size: 6, booked_places: 0, remaining_places: 6, booking_open: true,
      }]}});
    }
    if (path === '/bookings') {
      return route.fulfill({status: 201, json: {
        booking, managementToken: token, whatsappUrl: 'https://wa.me/60126243655',
      }});
    }
    if (path === '/booking/view') {
      expect(request.postDataJSON().token).toBe(token);
      return route.fulfill({json: {booking}});
    }
    return route.abort();
  });

  await page.goto('/book.html');
  await page.getByRole('button', {name: /Friday/}).click();
  await page.locator('.calendar-day.available').click();
  await page.locator('#name').fill('Returning Student');
  await page.locator('#email').fill('returning@example.com');
  await page.locator('#phone').fill('+60123456789');
  await page.getByLabel('Cash').check();
  await page.getByRole('button', {name: 'Confirm booking'}).click();
  await expect(page.getByText('MA-TEST123')).toBeVisible();

  await page.close();
  const returningPage = await context.newPage();
  await returningPage.goto('/my-bookings.html');
  await returningPage.getByRole('link', {name: 'Open my latest booking'}).click();
  await expect(returningPage.getByText('MA-TEST123')).toBeVisible();
  await expect(returningPage.locator('.status-pill')).toHaveText('Confirmed');
  await expect(returningPage).toHaveURL(/my-bookings\.html$/);
});
