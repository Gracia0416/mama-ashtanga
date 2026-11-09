const BOOKING_API_PATTERN = '**/functions/v1/booking-api/**';

async function mockBookingApi(target, handlers) {
  await target.route(BOOKING_API_PATTERN, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.split('/booking-api')[1];
    const handler = handlers[path.startsWith('/sessions') ? '/sessions' : path];
    if (!handler) return route.abort();
    const input = request.method() === 'POST' ? request.postDataJSON() : null;
    return handler({route, request, input});
  });
}

const json = (route, body, status = 200) => route.fulfill({status, json: body});

module.exports = {json, mockBookingApi};
