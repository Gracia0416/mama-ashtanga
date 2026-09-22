-- Apply the new price to future bookings. Existing booking/payment snapshots stay intact.
update public.class_types
set price_per_person_cents = 4000
where slug = 'group';
