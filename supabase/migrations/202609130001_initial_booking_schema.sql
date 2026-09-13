create extension if not exists pgcrypto with schema extensions;

create table public.class_types (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (length(trim(name)) between 1 and 80),
  price_per_person_cents integer check (price_per_person_cents >= 0),
  default_capacity smallint not null check (default_capacity between 1 and 100),
  max_party_size smallint not null check (
    max_party_size between 1 and default_capacity
  ),
  duration_minutes smallint not null check (duration_minutes between 15 and 480),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.class_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  class_type_id uuid not null references public.class_types(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity smallint not null check (capacity between 1 and 100),
  location text not null check (length(trim(location)) between 1 and 200),
  status text not null default 'scheduled' check (
    status in ('scheduled', 'cancelled', 'completed')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_sessions_time_order check (ends_at > starts_at),
  constraint class_sessions_unique_start unique (class_type_id, starts_at)
);

create table public.bookings (
  id uuid primary key default extensions.gen_random_uuid(),
  reference text not null unique default (
    'MA-' || upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 8))
  ),
  session_id uuid not null references public.class_sessions(id),
  user_id uuid references auth.users(id) on delete set null,
  contact_name text not null check (length(trim(contact_name)) between 1 and 100),
  contact_email text not null check (
    length(contact_email) <= 254 and contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  contact_phone text not null check (length(trim(contact_phone)) between 7 and 30),
  contact_email_verified_at timestamptz,
  party_size smallint not null check (party_size between 1 and 100),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  total_amount_cents integer not null check (total_amount_cents >= 0),
  status text not null default 'pending' check (
    status in (
      'pending', 'confirmed', 'cancelled_by_customer', 'cancelled_by_admin',
      'attended', 'no_show', 'expired'
    )
  ),
  member_note text check (length(member_note) <= 1000),
  email_verification_token_hash text not null,
  cancellation_token_hash text not null,
  expires_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text check (length(cancellation_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_total_matches_party_size check (
    total_amount_cents = unit_price_cents * party_size
  ),
  constraint bookings_pending_has_expiry check (
    (status = 'pending' and expires_at is not null)
    or status <> 'pending'
  )
);

create table public.booking_attendees (
  id uuid primary key default extensions.gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default extensions.gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  amount_cents integer not null check (amount_cents >= 0),
  method text not null check (method in ('cash', 'duitnow_qr', 'online_gateway')),
  status text not null default 'unpaid' check (
    status in ('unpaid', 'pending_verification', 'paid', 'partially_refunded', 'refunded', 'failed')
  ),
  provider_reference text check (length(provider_reference) <= 200),
  paid_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index payments_one_active_per_booking
  on public.payments (booking_id)
  where status not in ('failed', 'refunded');

create unique index bookings_email_verification_token_hash_idx
  on public.bookings (email_verification_token_hash);

create unique index bookings_cancellation_token_hash_idx
  on public.bookings (cancellation_token_hash);

create index class_sessions_starts_at_idx
  on public.class_sessions (starts_at)
  where status = 'scheduled';

create index bookings_session_active_idx
  on public.bookings (session_id, status, expires_at)
  where status in ('pending', 'confirmed');

create index bookings_user_id_idx
  on public.bookings (user_id)
  where user_id is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger class_types_set_updated_at
before update on public.class_types
for each row execute function public.set_updated_at();

create trigger class_sessions_set_updated_at
before update on public.class_sessions
for each row execute function public.set_updated_at();

create trigger bookings_set_updated_at
before update on public.bookings
for each row execute function public.set_updated_at();

create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

create or replace function public.get_session_availability(
  p_from timestamptz default now(),
  p_to timestamptz default now() + interval '90 days'
)
returns table (
  session_id uuid,
  class_type_slug text,
  class_type_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  price_per_person_cents integer,
  capacity smallint,
  max_party_size smallint,
  booked_places bigint,
  remaining_places bigint
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
    s.starts_at,
    s.ends_at,
    s.location,
    ct.price_per_person_cents,
    s.capacity,
    least(ct.max_party_size, s.capacity)::smallint,
    coalesce(sum(b.party_size) filter (
      where b.status = 'confirmed'
         or (b.status = 'pending' and b.expires_at > now())
    ), 0)::bigint as booked_places,
    greatest(
      s.capacity - coalesce(sum(b.party_size) filter (
        where b.status = 'confirmed'
           or (b.status = 'pending' and b.expires_at > now())
      ), 0),
      0
    )::bigint as remaining_places
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

create or replace function public.create_guest_booking(
  p_session_id uuid,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_party_size smallint,
  p_member_note text default null,
  p_payment_method text default 'cash'
)
returns table (
  booking_id uuid,
  booking_reference text,
  email_verification_token text,
  cancellation_token text,
  expires_at timestamptz,
  total_amount_cents integer
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
  v_email_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_cancellation_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
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

  if not found or v_session.status <> 'scheduled' or v_session.starts_at <= now() then
    raise exception using errcode = 'P0002', message = 'Session is not available';
  end if;

  select * into strict v_type
  from public.class_types
  where id = v_session.class_type_id and is_active;

  if v_type.price_per_person_cents is null then
    raise exception using errcode = '22023', message = 'Session price is not configured';
  end if;

  if p_party_size is null or p_party_size < 1
     or p_party_size > least(v_type.max_party_size, v_session.capacity) then
    raise exception using errcode = '22023', message = 'Party size is not allowed';
  end if;

  select coalesce(sum(party_size), 0)::integer into v_reserved
  from public.bookings
  where session_id = p_session_id
    and (
      status = 'confirmed'
      or (status = 'pending' and expires_at > now())
    );

  if v_reserved + p_party_size > v_session.capacity then
    raise exception using errcode = 'P0001', message = 'Not enough places remain';
  end if;

  insert into public.bookings (
    session_id,
    contact_name,
    contact_email,
    contact_phone,
    party_size,
    unit_price_cents,
    total_amount_cents,
    member_note,
    email_verification_token_hash,
    cancellation_token_hash,
    expires_at
  ) values (
    p_session_id,
    trim(p_contact_name),
    lower(trim(p_contact_email)),
    trim(p_contact_phone),
    p_party_size,
    v_type.price_per_person_cents,
    v_type.price_per_person_cents * p_party_size,
    nullif(trim(p_member_note), ''),
    encode(extensions.digest(v_email_token, 'sha256'), 'hex'),
    encode(extensions.digest(v_cancellation_token, 'sha256'), 'hex'),
    now() + interval '30 minutes'
  ) returning * into v_booking;

  insert into public.payments (booking_id, amount_cents, method)
  values (v_booking.id, v_booking.total_amount_cents, p_payment_method);

  return query select
    v_booking.id,
    v_booking.reference,
    v_email_token,
    v_cancellation_token,
    v_booking.expires_at,
    v_booking.total_amount_cents;
end;
$$;

create or replace function public.confirm_guest_booking(
  p_email_verification_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_email_verification_token is null or length(p_email_verification_token) <> 64 then
    return false;
  end if;

  update public.bookings
  set status = 'confirmed',
      contact_email_verified_at = coalesce(contact_email_verified_at, now()),
      expires_at = null
  where email_verification_token_hash = encode(
      extensions.digest(p_email_verification_token, 'sha256'), 'hex'
    )
    and status = 'pending'
    and expires_at > now();

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.cancel_guest_booking(
  p_cancellation_token text,
  p_reason text default null
)
returns table (
  booking_reference text,
  cancelled_at timestamptz,
  refund_eligible boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_session public.class_sessions;
  v_cancelled_at timestamptz := now();
begin
  if p_cancellation_token is null or length(p_cancellation_token) <> 64 then
    raise exception using errcode = '22023', message = 'Invalid cancellation token';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.cancellation_token_hash = encode(
    extensions.digest(p_cancellation_token, 'sha256'), 'hex'
  )
  for update;

  if not found or v_booking.status <> 'confirmed' then
    raise exception using errcode = 'P0002', message = 'Booking cannot be cancelled';
  end if;

  select * into strict v_session
  from public.class_sessions
  where id = v_booking.session_id;

  if v_cancelled_at > v_session.starts_at - interval '24 hours' then
    raise exception using
      errcode = 'P0001',
      message = 'Online cancellation closes 24 hours before class';
  end if;

  update public.bookings
  set status = 'cancelled_by_customer',
      cancelled_at = v_cancelled_at,
      cancellation_reason = nullif(trim(p_reason), '')
  where id = v_booking.id;

  return query select v_booking.reference, v_cancelled_at, true;
end;
$$;

alter table public.class_types enable row level security;
alter table public.class_sessions enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_attendees enable row level security;
alter table public.payments enable row level security;

revoke all on table public.class_types from anon, authenticated;
revoke all on table public.class_sessions from anon, authenticated;
revoke all on table public.bookings from anon, authenticated;
revoke all on table public.booking_attendees from anon, authenticated;
revoke all on table public.payments from anon, authenticated;

revoke all on function public.create_guest_booking(uuid, text, text, text, smallint, text, text) from public, anon, authenticated;
revoke all on function public.confirm_guest_booking(text) from public, anon, authenticated;
revoke all on function public.cancel_guest_booking(text, text) from public, anon, authenticated;

grant execute on function public.get_session_availability(timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.create_guest_booking(uuid, text, text, text, smallint, text, text) to service_role;
grant execute on function public.confirm_guest_booking(text) to service_role;
grant execute on function public.cancel_guest_booking(text, text) to service_role;

comment on function public.get_session_availability(timestamptz, timestamptz) is
  'Public, privacy-safe availability. Returns no customer or payment data.';
comment on function public.create_guest_booking(uuid, text, text, text, smallint, text, text) is
  'Creates a 30-minute booking hold. Call only from a protected server endpoint.';
comment on function public.confirm_guest_booking(text) is
  'Confirms a pending booking after email verification. Call only from a protected server endpoint.';
comment on function public.cancel_guest_booking(text, text) is
  'Cancels a confirmed booking when its secure token is valid and the class is at least 24 hours away.';
