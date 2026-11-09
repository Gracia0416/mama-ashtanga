const {test, expect} = require('@playwright/test');
const {BookingPage} = require('./pages/booking-page');
const {STUDENTS, groupSession} = require('./fixtures/booking-data');
const {json, mockBookingApi} = require('./support/mock-booking-api');

test.describe('booking availability rules', () => {
  test('a class that fills while booking refuses the extra booking', async ({page}) => {
    let remainingPlaces = 1;
    await mockBookingApi(page, {
      '/sessions': ({route}) => json(route, {sessions: [groupSession({
        session_id: 'last-place-session',
        booked_places: 6 - remainingPlaces,
        remaining_places: remainingPlaces,
      })]}),
      '/bookings': ({route}) => {
        remainingPlaces = 0;
        return json(route, {error: 'Only 0 places remain for this class.'}, 409);
      },
    });

    const bookingPage = new BookingPage(page);
    await bookingPage.open();
    await bookingPage.selectFirstFriday();
    await expect(bookingPage.partySize.locator('option')).toHaveCount(1);
    await bookingPage.completeForm(STUDENTS.default);
    await bookingPage.submit();

    await expect(page.getByText('Only 0 places remain for this class.')).toBeVisible();
    await expect(page.locator('.calendar-day.full')).toHaveAttribute('title', 'Fully booked');
    await expect(bookingPage.availableDate).toHaveCount(0);
    await expect(bookingPage.confirmationHeading).toHaveCount(0);
  });

  test('website shows a duplicate-booking rejection returned by the API', async ({page}) => {
    await mockBookingApi(page, {
      '/sessions': ({route}) => json(route, {sessions: [groupSession({booked_places: 1, remaining_places: 5})]}),
      '/bookings': ({route}) => json(route, {error: 'You already have an active booking for this class.'}, 409),
    });

    const bookingPage = new BookingPage(page);
    await bookingPage.bookFirstFriday(STUDENTS.returning);
    await expect(page.getByText('You already have an active booking for this class.')).toBeVisible();
    await expect(bookingPage.confirmationHeading).toHaveCount(0);
  });
});
