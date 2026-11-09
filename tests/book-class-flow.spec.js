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

test('saved latest-booking link opens without reloading the page', async ({page}) => {
  await page.route('**/functions/v1/booking-api/booking/view', async (route) => {
    expect(route.request().postDataJSON().token).toBe(token);
    await route.fulfill({json: {booking}});
  });
  await page.addInitScript(({savedToken}) => {
    localStorage.setItem('mamaAshtangaLatestBooking', `${location.origin}/my-bookings.html#booking=${savedToken}`);
    sessionStorage.clear();
  }, {savedToken: token});

  await page.goto('/my-bookings.html');
  await page.getByRole('link', {name: 'Open my latest booking'}).click();
  await expect(page.getByText('MA-TEST123')).toBeVisible();
  await expect(page).toHaveURL(/my-bookings\.html$/);
});
