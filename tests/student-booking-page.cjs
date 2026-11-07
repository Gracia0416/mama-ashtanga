const {chromium} = require('playwright');
const assert = require('node:assert/strict');

const base = 'http://127.0.0.1:8000';
const token = 'a'.repeat(64);

(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  for (const width of [390, 1440]) {
    const page = await browser.newPage({viewport: {width, height: 900}});
    const errors = [];
    let cancelled = false;
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', (dialog) => dialog.accept());
    await page.route('**/functions/v1/booking-api/**', async (route) => {
      const path = new URL(route.request().url()).pathname.split('/booking-api')[1];
      const input = route.request().postDataJSON();
      if (path === '/booking/view') {
        assert.equal(input.token, token);
        return route.fulfill({json: {booking: {
          booking_reference: 'MA-TEST123', class_type_name: 'Group Yoga', booking_mode: 'fixed_time',
          starts_at: '2027-01-08T10:00:00Z', ends_at: '2027-01-08T11:00:00Z', party_size: 2,
          total_amount_cents: 8000, booking_status: cancelled ? 'cancelled_by_customer' : 'confirmed',
          payment_method: 'duitnow_qr', payment_status: 'unpaid', can_cancel: !cancelled,
        }}});
      }
      if (path === '/cancel') {
        assert.equal(input.token, token);
        cancelled = true;
        return route.fulfill({json: {cancellation: {booking_status: 'cancelled_by_customer'}}});
      }
      return route.abort();
    });

    await page.addInitScript(({latest}) => {
      localStorage.setItem('mamaAshtangaLatestBooking', latest);
      sessionStorage.clear();
    }, {latest: `${base}/my-bookings.html#booking=${token}`});
    await page.goto(`${base}/my-bookings.html`);
    await page.getByRole('link', {name: 'Open my latest booking'}).click();
    await page.getByText('MA-TEST123').waitFor();
    assert.equal(await page.evaluate(() => location.hash), '');
    for (const text of ['Group Yoga', '6:00 PM', '2', 'Confirmed', 'DuitNow QR', 'Unpaid', 'Eligible']) {
      assert(await page.getByText(text, {exact: false}).count(), `Missing ${text} at ${width}px`);
    }
    assert.equal(await page.getByRole('link', {name: 'Contact Wirni'}).count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.getByRole('button', {name: 'Cancel booking'}).click();
    await page.locator('.status-pill').getByText('Cancelled by customer', {exact: false}).waitFor();
    assert.equal(await page.getByRole('button', {name: 'Cancel booking'}).count(), 0);
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log(`PASS ${width}px: private token removed, details shown, cancellation refreshed`);
    await page.close();
    cancelled = false;
  }
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
