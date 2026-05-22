-- Buildings table + item-link table for the Map tab feature.
--
-- The Map tab (new bottom-nav slot) renders public/campus-map.png with 18
-- absolute-positioned tap targets. Each target maps to one row in this
-- buildings table. Tapping opens a sheet showing the building's notes
-- (bulbs, air filter, oil type, …) plus a list of inventory items linked
-- via building_items.
--
-- All read access is open to authenticated staff; write access is admin-only.

-- ---------------------------------------------------------------------------
-- 1. buildings — one row per numbered tap target on the campus map.
--    number       — 1..N, matches the badge label drawn on the map image.
--    map_x/map_y  — tap-target center as a percentage of image dimensions
--                   (0..100). Stored on the row so admin can drag-to-relocate
--                   from inside the app later without rebuilding the image.
-- ---------------------------------------------------------------------------
create table if not exists buildings (
  id          uuid        primary key default gen_random_uuid(),
  number      smallint    not null unique check (number > 0),
  name        text        not null,
  notes       text,
  map_x       numeric(5,2) check (map_x is null or (map_x >= 0 and map_x <= 100)),
  map_y       numeric(5,2) check (map_y is null or (map_y >= 0 and map_y <= 100)),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists buildings_number_idx on buildings (number);

-- Track updated_at on edits.
create or replace function buildings_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists buildings_updated_at on buildings;
create trigger buildings_updated_at
  before update on buildings
  for each row execute function buildings_set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. building_items — many-to-many between buildings and inventory items.
--    usage_note  — free text describing how the item is consumed in this
--                  building (e.g., "32 fixtures, monthly inspection").
-- ---------------------------------------------------------------------------
create table if not exists building_items (
  building_id uuid        not null references buildings(id) on delete cascade,
  item_id     uuid        not null references items(id) on delete cascade,
  usage_note  text,
  created_at  timestamptz not null default now(),
  primary key (building_id, item_id)
);

create index if not exists building_items_item_idx on building_items (item_id);

-- ---------------------------------------------------------------------------
-- 3. RLS — staff can read; admins can write.
-- ---------------------------------------------------------------------------
alter table buildings      enable row level security;
alter table building_items enable row level security;

drop policy if exists buildings_staff_select on buildings;
create policy buildings_staff_select on buildings
  for select to authenticated using (true);

drop policy if exists buildings_admin_write on buildings;
create policy buildings_admin_write on buildings
  for all to authenticated
  using      (exists (select 1 from staff_profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from staff_profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists building_items_staff_select on building_items;
create policy building_items_staff_select on building_items
  for select to authenticated using (true);

drop policy if exists building_items_admin_write on building_items;
create policy building_items_admin_write on building_items
  for all to authenticated
  using      (exists (select 1 from staff_profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from staff_profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------------------------------------------------------------------------
-- 4. Seed the 18 buildings from the campus map legend. map_x / map_y are
--    initial estimates by eyeballing the illustration; admin can adjust
--    later via the edit UI without losing item links.
-- ---------------------------------------------------------------------------
insert into buildings (number, name, map_x, map_y) values
  ( 1, 'Ron E. Lewis Building',              48.0, 65.0),
  ( 2, 'Future Green Space / Parking',       22.0, 25.0),
  ( 3, 'Student Center / Gator Cafe',        47.0, 39.0),
  ( 4, 'Allied Health Building',             58.0, 79.0),
  ( 5, 'Stark Nursing Building',             78.0, 79.0),
  ( 6, 'Shahan Event Center',                75.0, 42.0),
  ( 7, 'Workforce Education Building',       62.0, 22.0),
  ( 8, 'Physical Plant',                     40.0, 12.0),
  ( 9, 'Wilson Building',                    24.0, 23.0),
  (10, 'Industrial Technology Building',     28.0, 14.0),
  (11, 'Welding Building',                   22.0, 14.0),
  (12, 'Electromechanical Tech Building A',  92.0, 42.0),
  (13, 'Electromechanical Tech Building B',  92.0, 49.0),
  (14, 'Gatemouth Plaza',                    38.0, 49.0),
  (15, 'Academic Building',                  27.0, 43.0),
  (16, 'Student Success Center',             11.0, 19.0),
  (17, 'CDL Logistics Training Center',      92.0, 78.0),
  (18, '1912 Building',                      20.0, 92.0)
on conflict (number) do nothing;
