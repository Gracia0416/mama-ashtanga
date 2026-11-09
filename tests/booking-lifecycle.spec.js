const {test, expect} = require('@playwright/test');
const {BookingPage} = require('./pages/booking-page');
const {MyBookingsPage} = require('./pages/my-bookings-page');
const {CONFIRMED_BOOKING, MANAGEMENT_TOKEN, STUDENTS, groupSession} = require('./fixtures/booking-data');
const {json, mockBookingApi} = require('./support/mock-booking-api');

test.describe('booking lifecycle', () => {
  test('student books two places, manages the booking and cancels', async ({page}) => {
    let currentBooking = {...CONFIRMED_BOOKING};
    let submittedBooking;
    const browserErrors = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));
    page.on('dialog', (dialog) => dialog.accept());

    await mockBookingApi(page, {
      '/sessions': ({route}) => json(route, {sessions: [groupSession()]}),
      '/bookings': ({route, input}) => {
        submittedBooking = input;
        return json(route, {
          booking: currentBooking, managementToken: MANAGEMENT_TOKEN,
          whatsappUrl: 'https://wa.me/60126243655',
        }, 201);
      },
      '/booking/view': ({route, input}) => {
        expect(input.token).toBe(MANAGEMENT_TOKEN);
        return json(route, {booking: currentBooking});
      },
      '/cancel': ({route, input}) => {
        expect(input.token).toBe(MANAGEMENT_TOKEN);
        currentBooking = {...currentBooking, booking_status: 'cancelled_by_customer', can_cancel: false};
        return json(route, {cancellation: {booking_status: 'cancelled_by_customer'}});
      },
    });

    const bookingPage = new BookingPage(page);
    await bookingPage.bookFirstFriday(STUDENTS.default, {partySize: '2', paymentMethod: 'duitnow_qr'});
    await expect(bookingPage.confirmationHeading).toBeVisible();
    await expect(page.getByText('MA-TEST123')).toBeVisible();
    expect(submittedBooking.partySize).toBe(2);
    expect(submittedBooking.paymentMethod).toBe('duitnow_qr');

    await bookingPage.openConfirmedBooking();
    const managementPage = new MyBookingsPage(page);
    await expect(page.getByText('MA-TEST123')).toBeVisible();
    await expect(page.getByText('6:00 PM')).toBeVisible();
    await expect(page.getByText('DuitNow QR')).toBeVisible();
    await expect(page.getByText('Unpaid')).toBeVisible();
    await expect(page.getByText('Eligible', {exact: false})).toBeVisible();
    await expect(page).toHaveURL(/my-bookings\.html$/);

    await managementPage.cancel();
    await expect(managementPage.statusPill).toContainText('Cancelled by customer');
    await expect(managementPage.cancelButton).toHaveCount(0);
    await expect(managementPage.contactWirni).toBeVisible();
    expect(await managementPage.horizontalOverflow()).toEqual([]);
    expect(browserErrors).toEqual([]);
  });

  test('student closes the site and reopens the latest booking in the same browser', async ({context, page}) => {
    await mockBookingApi(context, {
      '/sessions': ({route}) => json(route, {sessions: [groupSession()]}),
      '/bookings': ({route}) => json(route, {
        booking: CONFIRMED_BOOKING, managementToken: MANAGEMENT_TOKEN,
        whatsappUrl: 'https://wa.me/60126243655',
      }, 201),
      '/booking/view': ({route, input}) => {
        expect(input.token).toBe(MANAGEMENT_TOKEN);
        return json(route, {booking: CONFIRMED_BOOKING});
      },
    });

    const bookingPage = new BookingPage(page);
    await bookingPage.bookFirstFriday(STUDENTS.returning);
    await expect(page.getByText('MA-TEST123')).toBeVisible();

    await page.close();
    const returningPage = await context.newPage();
    const managementPage = new MyBookingsPage(returningPage);
    await managementPage.openLatest();
    await expect(returningPage.getByText('MA-TEST123')).toBeVisible();
    await expect(managementPage.statusPill).toHaveText('Confirmed');
    await expect(returningPage).toHaveURL(/my-bookings\.html$/);
  });
});
