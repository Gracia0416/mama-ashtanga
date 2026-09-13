alter table public.class_types
  add column booking_mode text not null default 'fixed_time'
  check (booking_mode in ('fixed_time', 'appointment_request'));

alter table public.bookings
  add column preferred_time time,
  add column client_request_id uuid unique;

alter table public.bookings
  alter column unit_price_cents drop not null,
  alter column total_amount_cents drop not null;

alter table public.bookings
  drop constraint bookings_total_matches_party_size,
  add constraint bookings_total_matches_party_size check (
    (unit_price_cents is null and total_amount_cents is null)
    or total_amount_cents = unit_price_cents * party_size
  );

update public.class_types
set price_per_person_cents = 3000,
    default_capacity = 6,
    max_party_size = 6,
    duration_minutes = 60,
    booking_mode = 'fixed_time'
where slug = 'group';

update public.class_types
set default_capacity = 2,
    max_party_size = 2,
    duration_minutes = 60,
    booking_mode = 'appointment_request'
where slug = 'private';

drop function if exists public.get_session_availability(timestamptz, timestamptz);

create function public.get_session_availability(
  p_from timestamptz default now(),
  p_to timestamptz default now() + interval '90 days'
)
returns table (
  session_id uuid,
  class_type_slug text,
  class_type_name text,
  booking_mode text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  price_per_person_cents integer,
  capacity smallint,
  max_party_size smallint,
  booked_places bigint,
  remaining_places bigint,
  booking_open boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    ct.slug,
    ct.name,
    ct.booking_mode,
    s.starts_at,
    s.ends_at,
    s.location,
    ct.price_per_person_cents,
    s.capacity,
    least(ct.max_party_size, s.capacity)::smallint,
    coalesce(sum(b.party_size) filter (
      where b.status = 'confirmed'
         or (b.status = 'pending' and b.expires_at > now())
    ), 0)::bigint,
    greatest(
      s.capacity - coalesce(sum(b.party_size) filter (
        where b.status = 'confirmed'
           or (b.status = 'pending' and b.expires_at > now())
      ), 0),
      0
    )::bigint,
    s.starts_at >= now() + interval '24 hours'
  from public.class_sessions s
  join public.class_types ct on ct.id = s.class_type_id
  left join public.bookings b on b.session_id = s.id
  where s.status = 'scheduled'
    and ct.is_active
    and s.starts_at >= p_from
    and s.starts_at < p_to
  group by s.id, ct.id
  order by s.starts_at;
$$;

drop function if exists public.create_guest_booking(uuid, text, text, text, smallint, text, text);

create function public.create_guest_booking(
  p_session_id uuid,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_party_size smallint,
  p_member_note text default null,
  p_payment_method text default 'cash',
  p_preferred_time time default null,
  p_client_request_id uuid default null
)
returns table (
  booking_id uuid,
  booking_reference text,
  cancellation_token text,
  total_amount_cents integer,
  booking_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.class_sessions;
  v_type public.class_types;
  v_reserved integer;
  v_booking public.bookings;
  v_cancellation_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if p_client_request_id is not null then
    select * into v_booking
    from public.bookings
    where client_request_id = p_client_request_id;

    if found then
      raise exception using errcode = '23505', message = 'This booking request was already submitted';
    end if;
  end if;

  if p_contact_name is null or length(trim(p_contact_name)) = 0 then
    raise exception using errcode = '22023', message = 'Name is required';
  end if;
  if p_contact_email is null or p_contact_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception using errcode = '22023', message = 'A valid email is required';
  end if;
  if p_contact_phone is null or length(trim(p_contact_phone)) < 7 then
    raise exception using errcode = '22023', message = 'A valid phone number is required';
  end if;
  if p_payment_method not in ('cash', 'duitnow_qr') then
    raise exception using errcode = '22023', message = 'Unsupported payment method';
  end if;

  select * into v_session
  from public.class_sessions
  where id = p_session_id
  for update;

  if not found or v_session.status <> 'scheduled' then
    raise exception using errcode = 'P0002', message = 'Session is not available';
  end if;
  if v_session.starts_at < now() + interval '24 hours' then
    raise exception using errcode = 'P0001', message = 'Classes must be booked at least 24 hours in advance';
  end if;

  select * into strict v_type
  from public.class_types
  where id = v_session.class_type_id and is_active;

  if v_type.booking_mode = 'appointment_request' and p_preferred_time is null then
    raise exception using errcode = '22023', message = 'A preferred time is required';
  end if;
  if v_type.booking_mode = 'fixed_time' and p_preferred_time is not null then
    raise exception using errcode = '22023', message = 'A preferred time is not allowed for this class';
  end if;
  if p_party_size is null or p_party_size < 1
     or p_party_size > least(v_type.max_party_size, v_session.capacity) then
    raise exception using errcode = '22023', message = 'Party size is not allowed';
  end if;

  select coalesce(sum(party_size), 0)::integer into v_reserved
  from public.bookings
  where session_id = p_session_id and status = 'confirmed';

  if v_reserved + p_party_size > v_session.capacity then
    raise exception using errcode = 'P0001', message = 'Not enough places remain';
  end if;

  insert into public.bookings (
    session_id, contact_name, contact_email, contact_phone, party_size,
    unit_price_cents, total_amount_cents, member_note, preferred_time,
    client_request_id, contact_email_verified_at,
    email_verification_token_hash, cancellation_token_hash,
    status, expires_at
  ) values (
    p_session_id, trim(p_contact_name), lower(trim(p_contact_email)),
    trim(p_contact_phone), p_party_size, v_type.price_per_person_cents,
    v_type.price_per_person_cents * p_party_size, nullif(trim(p_member_note), ''),
    p_preferred_time, p_client_request_id, null,
    encode(extensions.digest(encode(extensions.gen_random_bytes(32), 'hex'), 'sha256'), 'hex'),
    encode(extensions.digest(v_cancellation_token, 'sha256'), 'hex'),
    'confirmed', null
  ) returning * into v_booking;

  if v_booking.total_amount_cents is not null then
    insert into public.payments (booking_id, amount_cents, method)
    values (v_booking.id, v_booking.total_amount_cents, p_payment_method);
  end if;

  return query select v_booking.id, v_booking.reference, v_cancellation_token,
    v_booking.total_amount_cents, v_booking.status;
end;
$$;

create or replace function public.get_guest_booking(p_cancellation_token text)
returns table (
  booking_reference text,
  class_type_name text,
  booking_mode text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  contact_name text,
  party_size smallint,
  preferred_time time,
  total_amount_cents integer,
  booking_status text,
  payment_method text,
  payment_status text,
  can_cancel boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.reference, ct.name, ct.booking_mode, s.starts_at, s.ends_at,
    s.location, b.contact_name, b.party_size, b.preferred_time,
    b.total_amount_cents, b.status, p.method, p.status,
    b.status = 'confirmed' and now() <= s.starts_at - interval '24 hours'
  from public.bookings b
  join public.class_sessions s on s.id = b.session_id
  join public.class_types ct on ct.id = s.class_type_id
  left join public.payments p on p.booking_id = b.id
    and p.status not in ('failed', 'refunded')
  where b.cancellation_token_hash = encode(
    extensions.digest(p_cancellation_token, 'sha256'), 'hex'
  );
$$;

revoke all on function public.get_session_availability(timestamptz, timestamptz) from public;
grant execute on function public.get_session_availability(timestamptz, timestamptz) to anon, authenticated;

revoke all on function public.create_guest_booking(uuid, text, text, text, smallint, text, text, time, uuid) from public, anon, authenticated;
revoke all on function public.get_guest_booking(text) from public, anon, authenticated;
grant execute on function public.create_guest_booking(uuid, text, text, text, smallint, text, text, time, uuid) to service_role;
grant execute on function public.get_guest_booking(text) to service_role;

comment on function public.create_guest_booking(uuid, text, text, text, smallint, text, text, time, uuid) is
  'Creates a confirmed guest booking with atomic capacity and 24-hour cutoff checks.';
comment on function public.get_guest_booking(text) is
  'Returns one booking to a protected endpoint when its management token matches.';

-- Create twelve upcoming weeks. Monday is a private appointment request;
-- Friday is a fixed group class from 6:00 PM to 7:00 PM Malaysia time.
with weeks as (
  select generate_series(current_date, current_date + 83, interval '1 day')::date as day
), class_rows as (
  select id, slug, default_capacity from public.class_types where slug in ('group', 'private')
)
insert into public.class_sessions (
  class_type_id, starts_at, ends_at, capacity, location
)
select
  c.id,
  case
    when c.slug = 'group' then (w.day + time '18:00') at time zone 'Asia/Kuala_Lumpur'
    else w.day::timestamp at time zone 'Asia/Kuala_Lumpur'
  end,
  case
    when c.slug = 'group' then (w.day + time '19:00') at time zone 'Asia/Kuala_Lumpur'
    else (w.day + 1)::timestamp at time zone 'Asia/Kuala_Lumpur'
  end,
  c.default_capacity,
  'Casa Idaman, USJ 5'
from weeks w
join class_rows c on
  (c.slug = 'group' and extract(isodow from w.day) = 5)
  or (c.slug = 'private' and extract(isodow from w.day) = 1)
on conflict (class_type_id, starts_at) do nothing;

