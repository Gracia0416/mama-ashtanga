# Booking flow — one-page reference

## System boundary

```text
Customer → Mama Ashtanga website → Booking API → Supabase database
                                      ↓
                               WhatsApp to Wirni
```

Development API base URL:

```text
https://nvkbobgmrxkjttjvxddl.supabase.co/functions/v1/booking-api
```

## Happy path

```mermaid
sequenceDiagram
    autonumber
    actor Student
    participant Web as Website
    participant API as Booking API
    participant DB as Supabase database
    actor Wirni

    Student->>Web: Open booking page
    Web->>API: GET /sessions
    API->>DB: get_session_availability()
    DB-->>API: Friday and Monday sessions + remaining places
    API-->>Web: Available sessions
    Web-->>Student: Show bookable dates

    Student->>Web: Choose date, party size, payment method and details
    Web->>API: POST /bookings
    API->>DB: create_guest_booking()
    DB->>DB: Check 24-hour cutoff
    DB->>DB: Lock session and check capacity
    DB->>DB: Insert booking and payment
    DB-->>API: Reference + private management token
    API-->>Web: Booking confirmation + WhatsApp URL
    Web-->>Student: Show confirmed booking and management link
    Student->>Wirni: Send prepared WhatsApp message

    Student->>Web: Open private management link
    Web->>API: GET /booking?token=...
    API->>DB: get_guest_booking()
    DB-->>API: Safe booking and payment details
    API-->>Web: Booking details + can_cancel
    Web-->>Student: Show Manage booking

    Student->>Web: Cancel at least 24 hours before class
    Web->>API: POST /cancel
    API->>DB: cancel_guest_booking()
    DB->>DB: Mark cancelled and release places
    DB-->>API: Cancellation confirmed
    API-->>Web: Cancellation result
    Web-->>Student: Show cancellation and refund eligibility
```

## Unhappy paths

```mermaid
sequenceDiagram
    autonumber
    actor Student
    participant Web as Website
    participant API as Booking API
    participant DB as Supabase database
    actor Wirni

    alt Sessions cannot load
        Web->>API: GET /sessions
        API--xWeb: Network or server error
        Web-->>Student: Show retry message
    else Booking is inside 24 hours
        Web->>API: POST /bookings
        API->>DB: create_guest_booking()
        DB--xAPI: Booking closes 24 hours before class
        API-->>Web: 409 conflict
        Web-->>Student: Explain advance-booking rule
    else Class filled while form was open
        Web->>API: POST /bookings
        API->>DB: Lock session and check capacity
        DB--xAPI: Not enough places remain
        API-->>Web: 409 conflict
        Web->>API: GET /sessions
        Web-->>Student: Show refreshed availability
    else Invalid or duplicate submission
        Web->>API: POST /bookings
        API->>DB: Validate fields and request ID
        DB--xAPI: Invalid or already submitted
        API-->>Web: 400 error
        Web-->>Student: Show correction or existing-request message
    else Invalid management link
        Web->>API: GET /booking?token=...
        API->>DB: get_guest_booking()
        DB-->>API: No matching booking
        API-->>Web: 404 not found
        Web-->>Student: Show invalid-link message and contact Wirni
    else Cancellation is inside 24 hours
        Web->>API: POST /cancel
        API->>DB: cancel_guest_booking()
        DB--xAPI: Online cancellation closed
        API-->>Web: 409 conflict
        Web-->>Student: Explain non-refundable policy
        Student->>Wirni: Contact through WhatsApp
    end
```

## API responsibility map

| Request | Database function | Result |
|---|---|---|
| `GET /sessions` | `get_session_availability` | Public dates, prices, and remaining places |
| `POST /bookings` | `create_guest_booking` | Capacity-safe booking, payment record, reference, and management token |
| `GET /booking?token=...` | `get_guest_booking` | One booking's safe management details |
| `POST /cancel` | `cancel_guest_booking` | Cancellation when eligible and immediate capacity release |

## Schedule and rules

| Class | Schedule | Capacity | Price | Booking rule |
|---|---|---:|---:|---|
| Group Yoga | Friday, 6:00–7:00 PM | 6 | RM30/person | Book at least 24 hours ahead |
| Private Yoga | Monday, preferred time requested | 2 | To be decided | Book at least 24 hours ahead |

Customer cancellation is refundable at least 24 hours before class. Inside 24 hours, online cancellation is closed and the booking is non-refundable. If Wirni cancels a class, paid customers are eligible for a full refund.

## Environment status

| Environment | Current state | Purpose |
|---|---|---|
| Local static website | Available | View the existing frontend with `python3 -m http.server 8000` |
| Hosted Supabase development project | Available | Database and deployed Booking API testing |
| Local Supabase stack | Not available | Requires Docker or another container runtime |
| Separate staging website/database | Not created | Safe end-to-end testing before production |
| Production website/backend | Not configured as a separate environment | Public release after staging passes |

The current Supabase project is treated as **development**. It contains test data and should not be used as production until a separate production project and deployment process exist.

