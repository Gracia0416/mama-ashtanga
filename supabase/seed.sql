insert into public.class_types (
  slug,
  name,
  price_per_person_cents,
  default_capacity,
  max_party_size,
  duration_minutes
) values
  ('group', 'Group Yoga', 4000, 6, 3, 60),
  ('private', 'Private Yoga', null, 2, 2, 60)
on conflict (slug) do update set
  name = excluded.name,
  price_per_person_cents = excluded.price_per_person_cents,
  default_capacity = excluded.default_capacity,
  max_party_size = excluded.max_party_size,
  duration_minutes = excluded.duration_minutes,
  is_active = true;

