-- Hosted projects receive reference data through migrations because `db push`
-- intentionally does not execute supabase/seed.sql.
insert into public.class_types (
  slug, name, price_per_person_cents, default_capacity,
  max_party_size, duration_minutes, booking_mode
) values
  ('group', 'Group Yoga', 4000, 6, 6, 60, 'fixed_time'),
  ('private', 'Private Yoga', null, 2, 2, 60, 'appointment_request')
on conflict (slug) do update set
  name = excluded.name,
  price_per_person_cents = excluded.price_per_person_cents,
  default_capacity = excluded.default_capacity,
  max_party_size = excluded.max_party_size,
  duration_minutes = excluded.duration_minutes,
  booking_mode = excluded.booking_mode,
  is_active = true;

-- Add twelve upcoming weeks without duplicating sessions that already exist.
with days as (
  select generate_series(current_date, current_date + 83, interval '1 day')::date as day
), class_rows as (
  select id, slug, default_capacity
  from public.class_types
  where slug in ('group', 'private')
)
insert into public.class_sessions (
  class_type_id, starts_at, ends_at, capacity, location
)
select
  c.id,
  case
    when c.slug = 'group' then (d.day + time '18:00') at time zone 'Asia/Kuala_Lumpur'
    else d.day::timestamp at time zone 'Asia/Kuala_Lumpur'
  end,
  case
    when c.slug = 'group' then (d.day + time '19:00') at time zone 'Asia/Kuala_Lumpur'
    else (d.day + 1)::timestamp at time zone 'Asia/Kuala_Lumpur'
  end,
  c.default_capacity,
  'Casa Idaman, USJ 5'
from days d
join class_rows c on
  (c.slug = 'group' and extract(isodow from d.day) = 5)
  or (c.slug = 'private' and extract(isodow from d.day) = 1)
on conflict (class_type_id, starts_at) do nothing;
