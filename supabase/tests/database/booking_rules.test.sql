begin;

select plan(13);

select has_table('public', 'class_types', 'class_types exists');
select has_table('public', 'class_sessions', 'class_sessions exists');
select has_table('public', 'bookings', 'bookings exists');
select has_table('public', 'booking_attendees', 'booking_attendees exists');
select has_table('public', 'payments', 'payments exists');

select is(
  (select price_per_person_cents from public.class_types where slug = 'group'),
  4000,
  'group class costs RM40 per person'
);
select is(
  (select default_capacity from public.class_types where slug = 'group'),
  6::smallint,
  'group class capacity is six'
);
select is(
  (select max_party_size from public.class_types where slug = 'group'),
  6::smallint,
  'a group booking may reserve up to all six places'
);
select is(
  (select default_capacity from public.class_types where slug = 'private'),
  2::smallint,
  'private class capacity is two'
);

select function_privs_are(
  'public',
  'get_session_availability',
  array['timestamp with time zone', 'timestamp with time zone'],
  'anon',
  array['EXECUTE'],
  'anonymous visitors can read privacy-safe availability'
);
select function_privs_are(
  'public',
  'create_guest_booking',
  array['uuid', 'text', 'text', 'text', 'smallint', 'text', 'text', 'time without time zone', 'uuid'],
  'anon',
  array[]::text[],
  'anonymous visitors cannot bypass the booking endpoint'
);
select function_privs_are(
  'public',
  'get_guest_booking',
  array['text'],
  'anon',
  array[]::text[],
  'anonymous visitors cannot bypass booking-token validation'
);
select function_privs_are(
  'public',
  'cancel_guest_booking',
  array['text', 'text'],
  'anon',
  array[]::text[],
  'anonymous visitors cannot bypass the cancellation endpoint'
);

select * from finish();
rollback;
