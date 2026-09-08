# Mama Ashtanga — static starter website

A simple GitHub Pages-friendly starter site for Wirni's yoga classes.

## Pages
- `index.html` — home
- `about.html` — Wirni's story + qualifications
- `book.html` — weekly class booking request
- `location.html` — location + decorative map
- `styles.css` — all styling
- `script.js` — WhatsApp booking logic

## Add photos
Create an `assets` folder and add:
- `hero.jpg`
- `wirni.jpg`

The website will automatically use them.

## Publish on GitHub Pages

1. Create a GitHub repository, e.g. `mama-ashtanga`.
2. Upload all files from this folder to the repository root.
3. On GitHub, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch **main** and folder **/(root)**.
6. Save.
7. GitHub will show your public website URL after deployment.

Typical URL:
`https://YOUR-USERNAME.github.io/mama-ashtanga/`

## Booking behavior
For now, submitting the booking form opens WhatsApp with a pre-filled message to:
`+60 12-624 3655`

No personal data is stored by the website.

## Backend-friendly next step
When you are ready, you can replace the WhatsApp-only flow with:
- Supabase for class slots + booking database
- Firebase for bookings/auth
- Google Sheets + Apps Script for a very lightweight backend
- Stripe later if payments are needed

A simple data model could be:
- `classes(id, day_of_week, class_type, start_time, capacity, is_active)`
- `bookings(id, class_id, customer_name, phone, email, booking_date, status, created_at)`

This keeps the current frontend reusable when you add a backend.

## Easy maintenance after publishing

For small edits, you do not need to code locally:

1. Open your repository on GitHub.
2. Click the file you want to change, for example `index.html`.
3. Click the pencil icon **Edit this file**.
4. Make your change.
5. Click **Commit changes**.
6. GitHub Pages redeploys automatically.

For photos:
1. Open the `assets` folder in GitHub.
2. Choose **Add file → Upload files**.
3. Upload the new image.
4. Commit the change.
5. Reference it in HTML as `assets/your-photo.jpg`.

For larger redesigns, download/clone the repository, edit locally, then push the changes back to `main`.


## Marking a class as fully booked

This static version now has an interactive calendar.

Open `script.js` and find:

```js
const BOOKED_DATES = new Set([
  // Example: '2026-09-15',
]);
```

To grey out a date, add it in `YYYY-MM-DD` format:

```js
const BOOKED_DATES = new Set([
  '2026-09-15',
  '2026-09-24',
]);
```

Commit the change and GitHub Pages will redeploy automatically.

This is intentionally manual for version 1. When bookings grow, connect this calendar to Supabase so availability updates automatically for every visitor.


## Capacity model

Group classes are designed for a maximum of 6 students.

The frontend now understands a capacity of 6 and greys out dates whose booking count is 6 or more.

For the current GitHub Pages version, booking counts are only demo/static data in `script.js`.
This is not safe enough for real live capacity because multiple visitors do not share the same browser state.

When Supabase is added, the correct rule should be enforced in the database/backend:

- count confirmed bookings for the selected class/date
- if count >= 6, reject any new booking
- frontend renders that date as full/disabled
- the UI does not need to display the maximum capacity itself

## Pricing

Set the real prices in `script.js`:

```js
const CLASS_PRICES = {
  group: 35,
  private: 120
};
```

The homepage price list and the selected-session price will update automatically.
