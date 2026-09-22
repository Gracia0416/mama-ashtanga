# Mama Ashtanga

A small, static website for Wirni's yoga classes in USJ 5, Subang Jaya. It runs directly on GitHub Pages with no build step.

## Project structure

```text
.
├── index.html       Home page
├── about.html       Wirni's story and qualifications
├── book.html        Class selection and booking request
├── location.html    Class location and map
├── styles.css       Shared site styles
├── script.js        Shared navigation and page interactions
├── booking.js       Live booking, availability, and cancellation flow
├── assets/          Site images and logo
├── docs/            Product planning and backlog
└── supabase/        Database migrations, seed data, and database tests
```

## Run locally

The pages can be opened directly in a browser. For more reliable local testing, serve the directory with any static file server, for example:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Current booking flow

The booking page reads upcoming sessions from the development Supabase API. A visitor can choose a live session, see remaining capacity, enter contact and payment preferences, and create a database booking. The confirmation provides a private management link for viewing or cancelling the booking and an optional prepared WhatsApp message to Wirni.

The database performs the final 24-hour and capacity checks while locking the session, so simultaneous requests cannot overbook a class.

## Backend direction

The next version should store class sessions and bookings in a database. A practical first version can use Supabase for a hosted Postgres database and a small API, while keeping these static pages as the frontend.

See [the product backlog](docs/BACKLOG.md) for the proposed releases and open decisions, and [the database guide](docs/DATABASE.md) for a visual explanation of the schema, booking flow, and security model.

The deployed development API is documented in [the booking API guide](docs/API.md).
The complete happy path, unhappy paths, API calls, and environment status are summarized in [the booking flow one-pager](docs/BOOKING-FLOW.md).

Suggested data model:

- `class_types`: name, duration, capacity, price, and whether the class is active
- `class_sessions`: class type, start time, location, status, and optional capacity override
- `bookings`: session, customer name, phone, note, status, and creation time

The backend must enforce capacity in a transaction. The frontend should read available sessions from the API and submit bookings to it; WhatsApp can remain as an optional confirmation step.

Do not put database service keys or other secrets in `script.js`. Local `.env` files are ignored by Git, while a future `.env.example` may document required variable names safely.

The initial Supabase schema is versioned in `supabase/migrations`. It exposes only privacy-safe class availability to browser clients. Booking creation, email confirmation, and cancellation mutations are reserved for protected server endpoints so customer data and business rules cannot be bypassed from the browser.

The current defaults are RM40 per person and six places for group classes, with up to six people per group booking. Private classes have two places; their price remains unset until the pricing model is confirmed. Email verification and automatic confirmation delivery remain follow-up work.

## Publish

In the GitHub repository settings, open **Pages**, choose **Deploy from a branch**, and publish the `main` branch from `/(root)`. GitHub Pages will redeploy after each push to `main`.
