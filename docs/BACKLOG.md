# Mama Ashtanga product backlog

Planning date: 13 September 2026

## Product goal

Let customers book and manage yoga classes online, while giving Wirni a reliable view of attendance, capacity, cancellations, and payment status. Saved member details can follow after the MVP proves useful.

## Recommended first release

The first release should include:

1. Guest booking with name, phone number, and verified email.
2. Live class availability from Supabase.
3. Group classes at RM30 per person with six total places.
4. Private classes with two total places.
5. Individual and small group bookings.
6. Cancellation through a secure email link at least 24 hours before class for a refund.
7. Cash and DuitNow QR as manually reconciled payment methods.
8. A simple admin view for Wirni to manage sessions, bookings, and payments.

Automated payment collection should be a later release. A RM1 fixed gateway fee would be material on a RM30 booking, and static QR payments do not automatically tell the website that a payment succeeded.

Member accounts and saved profiles are intentionally deferred until after the MVP. This avoids SMS login costs while the booking workflow is being validated.

## Decisions and assumptions

These are working decisions for planning and can be changed before implementation.

| Topic | Recommendation | Reason |
|---|---|---|
| Login | Deferred until after MVP | Avoids SMS costs while validating the booking workflow |
| Email | Required and verified during booking | Used for booking confirmations, secure cancellation links, and receipts |
| Guest booking | Required for MVP | Every customer can book without creating an account |
| Group class | RM30 per person, capacity 6 | Matches the requested business rule |
| Private class | Capacity 2 | Supports one or two people in the session |
| Group booking | Allow 1–6 places per booking | Supports individual and whole-group reservations within the six-place class capacity |
| Payment in MVP | Cash or merchant DuitNow QR | Easy to launch and validate before paying for a gateway |
| Payment confirmation | Wirni marks it paid | Static QR and cash require manual reconciliation |
| Cancellation | Customer uses the secure link in their confirmation email | Provides self-service cancellation without requiring an account |
| Cancellation cutoff | 24 hours before class starts | Confirmed business rule |
| Refunds | Refundable at least 24 hours before class; non-refundable inside 24 hours | Confirmed policy; refunds remain manual while payments are manual |

## Essential data to store

Only collect information needed to run classes. Payment facts belong to each payment or booking, rather than permanently on the customer profile.

### `profiles` (post-MVP)

- `id`: same UUID as the Supabase Auth user
- `full_name`
- `phone`: the member's verified login identifier, primarily managed by Supabase Auth
- `email`: required for confirmations and receipts, with `email_verified_at`
- `emergency_contact_name` and `emergency_contact_phone`: optional; collect only if operationally necessary
- `notes`: optional member-supplied accessibility or practice note
- `created_at`, `updated_at`

Avoid storing passwords, card numbers, online-banking credentials, identity documents, or broad medical histories.

### `class_types`

- `id`
- `name`: group or private
- `price_per_person_cents`: `3000` for RM30
- `default_capacity`: `6` for group, `2` for private
- `duration_minutes`
- `is_active`

Store money as integer sen, not a decimal floating-point number.

### `class_sessions`

- `id`
- `class_type_id`
- `starts_at`, `ends_at`
- `capacity`: copied from the class type but adjustable for one session
- `location`
- `status`: scheduled, cancelled, or completed
- `created_at`, `updated_at`

### `bookings`

- `id`
- `session_id`
- `user_id`: nullable for guest bookings
- `contact_name`, `contact_email`, `contact_phone`: snapshot at booking time
- `party_size`
- `unit_price_cents` and `total_amount_cents`: snapshot at booking time
- `status`: pending, confirmed, cancelled_by_member, cancelled_by_admin, attended, or no_show
- `member_note`
- `cancelled_at`, `cancellation_reason`
- `created_at`, `updated_at`

Keeping contact and price snapshots preserves the original booking even if a member later edits their profile or prices change.

### `booking_attendees`

- `id`
- `booking_id`
- `name`

This is needed only when `party_size` is greater than one. Do not require each guest to create an account.

### `payments`

- `id`
- `booking_id`
- `amount_cents`
- `method`: cash, duitnow_qr, or later online_gateway
- `status`: unpaid, pending_verification, paid, partially_refunded, refunded, or failed
- `provider_reference`: optional transaction reference
- `paid_at`
- `verified_by`, `verified_at`
- `created_at`, `updated_at`

Do not use “amount paid” on the profile because a member can have many bookings and payments.

## Capacity and availability rules

Availability must be calculated from active bookings, not maintained as a manually edited number.

```text
spots remaining = session capacity
                - sum(party size for pending/confirmed bookings)
```

The booking endpoint must lock or atomically update the session while checking capacity. A browser-only check is insufficient because two customers can submit at the same time.

The public availability endpoint should return session details, price, capacity, booked places, and remaining places. It must not return member names, phone numbers, emails, notes, or payment information.

## Cancellation rules

- Every MVP booking receives a secure cancellation link by verified email using an expiring, single-use, unguessable token.
- Cancellation changes the booking status; it should not delete the record.
- Cancelling releases `party_size` places immediately.
- A cancellation made at least 24 hours before `starts_at` is eligible for a refund.
- Inside the 24-hour window, self-service cancellation is unavailable; the site asks the member to contact Wirni and states that the booking is non-refundable.
- The exact cutoff instant is `class starts_at - 24 hours`; a request received at or before that instant is eligible.
- If Wirni cancels a session, all active bookings are marked as cancelled by admin and members should be notified.
- If Wirni cancels a session, the 24-hour member cutoff does not apply and paid bookings are eligible for a full refund.
- Payment and refund status remain separate from booking status.

## Backlog

### Epic 0 — confirm business rules

- [ ] Confirm whether a pending/unpaid booking reserves a place and for how long.
- [x] Allow one to six people in a group booking.
- [ ] Confirm whether private pricing is per session or per person.
- [ ] Confirm whether the emergency contact fields are necessary.
- [ ] Survey members on cash, DuitNow QR, and online checkout preferences.

### Epic 1 — Supabase foundation

- [ ] Create separate Supabase development and production projects.
- [x] Add local Supabase configuration and migrations to the repository.
- [x] Create the class, session, booking, attendee, and payment tables.
- [x] Add database constraints for valid prices, party sizes, capacities, and statuses.
- [x] Seed the group and private class types.
- [x] Enable Row Level Security on every exposed table.
- [x] Add automated database tests for capacity and access policies.
- [ ] Run the migration and database tests against local Supabase or a development project.

Acceptance criteria:

- Group sessions default to six places and RM30 per person.
- Private sessions default to two places.
- Browser clients cannot read or change another member's personal data.
- Secret/service keys never appear in frontend code or Git history.

### Epic 2 — guest identity and contact verification

- [ ] Collect the customer's name, phone number, and email during booking.
- [ ] Verify the email address before confirming the first booking.
- [ ] Store contact details as a booking snapshot.
- [ ] Protect booking submission with rate limits and CAPTCHA.
- [ ] Generate a secure cancellation token for each confirmed booking.

Acceptance criteria:

- A customer can book without creating an account.
- Confirmations, cancellation links, and receipts are sent only to a verified email address.
- A public user cannot retrieve another customer's booking or contact details.

### Epic 3 — live sessions, availability, and booking

- [ ] Replace hard-coded weekdays and booking counts with database sessions.
- [x] Add a public endpoint for upcoming session availability.
- [ ] Display remaining places on the calendar.
- [ ] Add party-size selection and optional attendee names.
- [x] Add a secure booking endpoint with an atomic capacity check.
- [ ] Show a booking confirmation and reference number.
- [x] Retain WhatsApp as an optional follow-up link.

Acceptance criteria:

- The UI never offers more places than remain.
- The database rejects overbooking even for simultaneous requests.
- A party of two reduces availability by two.
- Personal booking data is never exposed through availability responses.

### Epic 4 — secure cancellation

- [ ] Allow refundable self-service cancellation at least 24 hours before class.
- [ ] Disable self-service cancellation inside 24 hours and show the non-refundable policy.
- [x] Validate the cancellation token on the server.
- [x] Restore capacity immediately after cancellation.
- [x] Record who cancelled, when, and why.

Acceptance criteria:

- A cancellation link grants access only to its associated booking and cannot be reused.
- Cancelled records remain available for reporting.
- Cancellation eligibility is calculated from the session start time and the server's current time, not the member's browser clock.
- A member cancellation inside 24 hours is non-refundable and requires contacting Wirni.

### Epic 5 — manual payments

- [ ] Let the member choose cash or DuitNow QR.
- [ ] Display the merchant QR and clear payment instructions.
- [ ] Record the selected method and amount due.
- [ ] Add an admin action to mark payment as paid.
- [ ] Show payment status on the secure booking confirmation page.
- [ ] Add a daily list of unpaid and pending-verification bookings.

Acceptance criteria:

- A booking and its payment status can change independently.
- Wirni can reconcile cash and QR payments without editing the database directly.
- No bank credentials or card details are stored by Mama Ashtanga.

### Epic 6 — admin operations

- [ ] Add an admin role that members cannot grant themselves.
- [ ] Add session creation, editing, and cancellation.
- [ ] Add attendee lists and remaining-capacity views.
- [ ] Add booking status and payment status controls.
- [ ] Add basic filters and CSV export.
- [ ] Add attendance and no-show recording.

### Epic 7 — notifications and automated payments

- [ ] Send booking confirmations to the member's verified email.
- [ ] Send cancellation confirmations showing refund eligibility and status.
- [ ] Send a receipt when a payment is marked paid.
- [ ] Send class reminders.
- [ ] Notify affected members when a session is cancelled.
- [ ] Compare an online payment gateway against the manual QR workflow using real booking volume.
- [ ] If justified, add hosted checkout and verified payment webhooks.
- [ ] Add automated refund handling only after the cancellation policy is final.

### Epic 8 — member accounts after MVP

- [ ] Review booking volume and member feedback before choosing a login method.
- [ ] Compare email magic links with phone OTP costs and convenience.
- [ ] Add member registration and login if the benefit justifies the operating cost.
- [ ] Create a profile from the member's verified identity.
- [ ] Add “My profile” and “My bookings” pages.
- [ ] Pre-fill new bookings from the saved profile.
- [ ] Safely associate earlier guest bookings after verifying the same email or phone number.

## Suggested delivery slices

| Slice | Outcome | Epics |
|---|---|---|
| 1. Data foundation | Secure database and business rules | 0–1 |
| 2. Bookable MVP | Guest verification, live availability, and capacity-safe booking | 2–3 |
| 3. Self-service | Secure cancellation | 4 |
| 4. Operations | Manual payments and admin tools | 5–6 |
| 5. Automation | Notifications and optional payment gateway | 7 |
| 6. Member convenience | Optional login, profiles, and booking history | 8 |

## Member survey

Keep the survey short enough to answer in under two minutes:

1. How do you prefer to pay for class: cash, DuitNow QR, or online checkout?
2. Would you pay when booking or after class?
3. How often do you book for another person?
4. If group booking is available, how many people do you usually book for?
5. Would receiving confirmations, cancellations, and receipts by email be useful?
6. After trying the booking system, would a saved member account be useful to you?

## Technical references

- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase phone login: https://supabase.com/docs/guides/auth/phone-login
- Supabase user profiles: https://supabase.com/docs/guides/auth/managing-user-data
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- DuitNow QR merchant display guidance: https://paynet.my/attachments/duitnow-qr/DNQR_Guidelines_0825.pdf
- Stripe Malaysia pricing: https://stripe.com/en-my/pricing
