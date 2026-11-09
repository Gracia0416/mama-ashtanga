const {test, expect} = require('@playwright/test');
const {MyBookingsPage} = require('./pages/my-bookings-page');
const {CONFIRMED_BOOKING, MANAGEMENT_TOKEN} = require('./fixtures/booking-data');
const {json, mockBookingApi} = require('./support/mock-booking-api');

test.describe('booking cancellation policy', () => {
  test('booking inside the 24-hour window cannot be cancelled online', async ({page}) => {
    let cancellationRequests = 0;
    const lateBooking = {...CONFIRMED_BOOKING, can_cancel: false};
    await mockBookingApi(page, {
      '/booking/view': ({route, input}) => {
        expect(input.token).toBe(MANAGEMENT_TOKEN);
        return json(route, {booking: lateBooking});
      },
      '/cancel': ({route}) => {
        cancellationRequests += 1;
        return json(route, {error: 'Cancellation closes 24 hours before class.'}, 409);
      },
    });

    const managementPage = new MyBookingsPage(page);
    await managementPage.openWithToken(MANAGEMENT_TOKEN);
    await expect(page.getByText('Online cancellation is closed within 24 hours of class.')).toBeVisible();
    await expect(managementPage.cancelButton).toHaveCount(0);
    await expect(managementPage.contactWirni).toBeVisible();
    expect(cancellationRequests).toBe(0);
  });
});
