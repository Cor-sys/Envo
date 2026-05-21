-- Stockroom — Supabase / Postgres schema (v2: any inventory, not just bulbs)
-- Run this in the Supabase SQL editor (or `psql -f db/schema.sql` against a
-- self-hosted instance). Idempotent: safe to re-run on a fresh project.
--
-- Design rules:
--   * One unified `items` table covers every kind of inventory (light bulbs,
--     tools, paint, chemicals, belts, supplies, future X). Type-specific
--     attributes live in `items.metadata` (jsonb) so they cost zero migrations.
--   * `transactions` is an immutable activity log. Quantity is derived from it
--     and reconciled against current items.qty; never UPDATE items.qty from
--     the client — always go through record_movement().
--   * Soft delete on long-lived entities (items, suppliers, locations) via
--     `deleted_at`. Views filter it out; admin queries can still see it.
--   * RLS is flat-staff for v1 (any authenticated user can read/write).
--     Tightens once staff_profiles.role drives admin/staff/viewer.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Shared trigger function
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- SKU sequence: monotonic STK####, never reused.
-- ---------------------------------------------------------------------------
create sequence if not exists stk_seq start 1 minvalue 1;

create or replace function next_stk_sku() returns text
language sql volatile
set search_path = public, pg_temp as $$
  select 'STK' || lpad(nextval('stk_seq')::text, 4, '0');
$$;

-- ---------------------------------------------------------------------------
-- suppliers
-- ---------------------------------------------------------------------------
create table if not exists suppliers (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  contact     text,
  email       text,
  phone       text,
  website     text,
  account_no  text,
  notes       text,
  metadata    jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists suppliers_name_idx on suppliers (lower(name)) where deleted_at is null;

drop trigger if exists suppliers_set_updated_at on suppliers;
create trigger suppliers_set_updated_at before update on suppliers
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- locations  (hierarchical: site > room > shelf > bin, optionally vehicles)
-- ---------------------------------------------------------------------------
create table if not exists locations (
  id          uuid        primary key default gen_random_uuid(),
  parent_id   uuid        references locations(id) on delete restrict,
  name        text        not null,
  code        text,
  kind        text        not null default 'shelf'
              check (kind in ('site','room','shelf','bin','vehicle','other')),
  notes       text,
  metadata    jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists locations_parent_idx on locations (parent_id) where deleted_at is null;
create index if not exists locations_code_idx   on locations (code)      where deleted_at is null;

drop trigger if exists locations_set_updated_at on locations;
create trigger locations_set_updated_at before update on locations
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- tags  (flexible labels for filtering: "outdoor", "winter", "high-priority")
-- ---------------------------------------------------------------------------
create table if not exists tags (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null unique,
  color       text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- staff_profiles  (extension of auth.users with role + display name)
-- ---------------------------------------------------------------------------
create table if not exists staff_profiles (
  id          uuid        primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        text        not null default 'staff'
              check (role in ('admin','staff','viewer')),
  is_active   boolean     not null default true,
  metadata    jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists staff_profiles_set_updated_at on staff_profiles;
create trigger staff_profiles_set_updated_at before update on staff_profiles
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- items  (universal core for any inventory thing)
-- ---------------------------------------------------------------------------
create table if not exists items (
  id             uuid        primary key default gen_random_uuid(),
  sku            text        not null unique default next_stk_sku(),
  item_type      text        not null default 'light_bulb',
  category       text,                                       -- optional sub-category within item_type
  name           text        not null,
  brand          text,
  model          text,
  barcode        text        unique,                         -- factory UPC; null → needs printed QR label
  qty            integer     not null default 0 check (qty >= 0),
  threshold      integer     not null default 0 check (threshold >= 0),
  location_text  text,                                       -- free-form bin code while locations table fills out
  location_id    uuid        references locations(id) on delete set null,
  supplier_id    uuid        references suppliers(id) on delete set null,
  image_path     text,                                       -- primary photo, key in Supabase Storage
  metadata       jsonb       not null default '{}'::jsonb,   -- type-specific attributes; zero migrations
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz                                 -- soft delete
);

create index if not exists items_item_type_idx   on items (item_type)   where deleted_at is null;
create index if not exists items_category_idx    on items (category)    where deleted_at is null;
create index if not exists items_location_id_idx on items (location_id) where deleted_at is null;
create index if not exists items_supplier_id_idx on items (supplier_id) where deleted_at is null;
create index if not exists items_deleted_at_idx  on items (deleted_at);
-- Partial index lets us cheaply find rows that need a printed QR label.
create index if not exists items_no_barcode_idx  on items (id) where barcode is null and deleted_at is null;

drop trigger if exists items_set_updated_at on items;
create trigger items_set_updated_at before update on items
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- item_tags  (many-to-many)
-- ---------------------------------------------------------------------------
create table if not exists item_tags (
  item_id    uuid not null references items(id) on delete cascade,
  tag_id     uuid not null references tags(id)  on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, tag_id)
);
create index if not exists item_tags_tag_idx on item_tags (tag_id);

-- ---------------------------------------------------------------------------
-- item_photos
-- ---------------------------------------------------------------------------
create table if not exists item_photos (
  id           uuid        primary key default gen_random_uuid(),
  item_id      uuid        not null references items(id) on delete cascade,
  storage_path text        not null,
  caption      text,
  sort_order   integer     not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists item_photos_item_idx on item_photos (item_id, sort_order);

-- ---------------------------------------------------------------------------
-- documents  (manuals, MSDS, warranties, certifications)
-- ---------------------------------------------------------------------------
create table if not exists documents (
  id           uuid        primary key default gen_random_uuid(),
  item_id      uuid        not null references items(id) on delete cascade,
  storage_path text        not null,
  title        text        not null,
  doc_type     text        not null default 'other'
               check (doc_type in ('manual','msds','warranty','cert','other')),
  expires_on   date,                                            -- for MSDS / cert renewals
  metadata     jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists documents_item_idx    on documents (item_id);
create index if not exists documents_expires_idx on documents (expires_on) where expires_on is not null;

-- ---------------------------------------------------------------------------
-- transactions  (immutable activity log — source of truth for stock movement)
-- ---------------------------------------------------------------------------
create table if not exists transactions (
  id                uuid        primary key default gen_random_uuid(),
  item_id           uuid        not null references items(id) on delete restrict,
  direction         text        not null check (direction in ('in', 'out')),
  qty               integer     not null check (qty > 0),
  staff_id          uuid        references auth.users(id),
  staff_label       text,                                          -- denorm name for display
  note              text,                                          -- free text: job / customer / reason
  from_location_id  uuid        references locations(id) on delete set null,
  to_location_id    uuid        references locations(id) on delete set null,
  reason            text        check (reason is null or reason in
                      ('restock','consume','transfer','adjust','correction','damaged','found')),
  idempotency_key   uuid,                                          -- offline-queue retry de-dup; see record_movement
  occurred_at       timestamptz not null default now()
);

create index if not exists transactions_item_idx     on transactions (item_id, occurred_at desc);
create index if not exists transactions_occurred_idx on transactions (occurred_at desc);
create index if not exists transactions_staff_idx    on transactions (staff_id);
create unique index if not exists transactions_idempotency_key_uniq
  on transactions (idempotency_key) where idempotency_key is not null;

-- Enforce immutability: no UPDATE or DELETE on the activity log.
create or replace function transactions_immutable() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
begin
  raise exception 'transactions are immutable (use a compensating row instead)';
end;
$$;

drop trigger if exists transactions_no_update on transactions;
create trigger transactions_no_update before update on transactions
  for each row execute function transactions_immutable();

drop trigger if exists transactions_no_delete on transactions;
create trigger transactions_no_delete before delete on transactions
  for each row execute function transactions_immutable();

-- ---------------------------------------------------------------------------
-- record_movement: atomic check-in / check-out (BRIEF section 8.1).
-- Clients MUST use this RPC, never a raw UPDATE on items.qty, so concurrent
-- scans cannot clobber each other.
--
-- p_idempotency_key (optional): a client-generated UUID so the offline queue
-- can safely retry. The unique constraint on transactions.idempotency_key
-- short-circuits a duplicate apply — the second call returns the original
-- row without touching items.qty.
-- ---------------------------------------------------------------------------
drop function if exists record_movement(uuid, text, integer, text);
drop function if exists record_movement(uuid, text, integer, text, uuid);

create or replace function record_movement(
  p_item_id          uuid,
  p_direction        text,
  p_qty              integer,
  p_note             text default null,
  p_idempotency_key  uuid default null
) returns transactions
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_user_id  uuid := auth.uid();
  v_staff    text;
  v_new_qty  integer;
  v_txn      transactions;
begin
  if p_direction not in ('in', 'out') then
    raise exception 'direction must be ''in'' or ''out''';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'qty must be a positive integer';
  end if;

  if v_user_id is not null then
    select coalesce(raw_user_meta_data->>'full_name', email)
      into v_staff
      from auth.users
     where id = v_user_id;
  end if;

  -- Insert the txn first. The unique idempotency_key reserves the slot; a
  -- concurrent or queued retry blocks here, then returns the existing row
  -- without re-applying.
  begin
    insert into transactions
      (item_id, direction, qty, staff_id, staff_label, note, idempotency_key)
    values
      (p_item_id, p_direction, p_qty, v_user_id, v_staff, p_note, p_idempotency_key)
    returning * into v_txn;
  exception when unique_violation then
    select * into v_txn
      from transactions
     where idempotency_key = p_idempotency_key;
    return v_txn;
  end;

  -- Same txn as the insert. If the qty update fails (item missing, would go
  -- negative), the txn row rolls back too — retry semantics stay clean.
  update items
     set qty = case when p_direction = 'in' then qty + p_qty else qty - p_qty end
   where id = p_item_id
     and deleted_at is null
   returning qty into v_new_qty;

  if not found then
    raise exception 'item % not found (or deleted)', p_item_id;
  end if;
  if v_new_qty < 0 then
    raise exception 'check-out would drop qty below zero';
  end if;

  return v_txn;
end;
$$;

revoke all     on function record_movement(uuid, text, integer, text, uuid) from public;
revoke execute on function record_movement(uuid, text, integer, text, uuid) from anon;
grant  execute on function record_movement(uuid, text, integer, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Convenience views
-- ---------------------------------------------------------------------------

-- items_with_status: derived status per BRIEF section 7. Filters out soft-deleted items.
-- security_invoker = true so RLS on items applies to the caller, not the view owner.
create or replace view items_with_status with (security_invoker = true) as
  select i.*,
         case
           when i.qty <= 0           then 'out'
           when i.qty <= i.threshold then 'low'
           else                            'ok'
         end as status,
         (i.barcode is null) as needs_label
    from items i
   where i.deleted_at is null;

-- reorder_list: every non-OK item, with a suggested order qty back to threshold.
create or replace view reorder_list with (security_invoker = true) as
  select i.id,
         i.sku,
         i.item_type,
         i.category,
         i.name,
         i.brand,
         i.qty,
         i.threshold,
         i.location_text,
         i.location_id,
         greatest(i.threshold - i.qty, 1) as suggested_qty,
         case when i.qty <= 0 then 'out' else 'low' end as status
    from items i
   where i.deleted_at is null
     and i.qty <= i.threshold
   order by (case when i.qty <= 0 then 0 else 1 end), i.item_type, i.category, i.name;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- v1: everyone signed in can read and edit (BRIEF section 3 — flat staff role).
-- The intentionally-permissive policies below are flagged by Supabase's linter;
-- when admin/staff/viewer split lands, replace each `true` with a check against
-- staff_profiles.role.
-- ---------------------------------------------------------------------------
alter table items          enable row level security;
alter table transactions   enable row level security;
alter table suppliers      enable row level security;
alter table locations      enable row level security;
alter table tags           enable row level security;
alter table item_tags      enable row level security;
alter table item_photos    enable row level security;
alter table documents      enable row level security;
alter table staff_profiles enable row level security;

drop policy if exists items_select on items;
drop policy if exists items_insert on items;
drop policy if exists items_update on items;
drop policy if exists items_delete on items;
create policy items_select on items for select to authenticated using (true);
create policy items_insert on items for insert to authenticated with check (true);
create policy items_update on items for update to authenticated using (true) with check (true);
create policy items_delete on items for delete to authenticated using (true);

drop policy if exists transactions_select on transactions;
drop policy if exists transactions_insert on transactions;
create policy transactions_select on transactions for select to authenticated using (true);
create policy transactions_insert on transactions for insert to authenticated
  with check (staff_id is null or staff_id = (select auth.uid()));

drop policy if exists suppliers_select on suppliers;
drop policy if exists suppliers_insert on suppliers;
drop policy if exists suppliers_update on suppliers;
drop policy if exists suppliers_delete on suppliers;
create policy suppliers_select on suppliers for select to authenticated using (true);
create policy suppliers_insert on suppliers for insert to authenticated with check (true);
create policy suppliers_update on suppliers for update to authenticated using (true) with check (true);
create policy suppliers_delete on suppliers for delete to authenticated using (true);

drop policy if exists locations_select on locations;
drop policy if exists locations_insert on locations;
drop policy if exists locations_update on locations;
drop policy if exists locations_delete on locations;
create policy locations_select on locations for select to authenticated using (true);
create policy locations_insert on locations for insert to authenticated with check (true);
create policy locations_update on locations for update to authenticated using (true) with check (true);
create policy locations_delete on locations for delete to authenticated using (true);

drop policy if exists tags_select on tags;
drop policy if exists tags_insert on tags;
drop policy if exists tags_update on tags;
drop policy if exists tags_delete on tags;
create policy tags_select on tags for select to authenticated using (true);
create policy tags_insert on tags for insert to authenticated with check (true);
create policy tags_update on tags for update to authenticated using (true) with check (true);
create policy tags_delete on tags for delete to authenticated using (true);

drop policy if exists item_tags_select on item_tags;
drop policy if exists item_tags_insert on item_tags;
drop policy if exists item_tags_delete on item_tags;
create policy item_tags_select on item_tags for select to authenticated using (true);
create policy item_tags_insert on item_tags for insert to authenticated with check (true);
create policy item_tags_delete on item_tags for delete to authenticated using (true);

drop policy if exists item_photos_select on item_photos;
drop policy if exists item_photos_insert on item_photos;
drop policy if exists item_photos_update on item_photos;
drop policy if exists item_photos_delete on item_photos;
create policy item_photos_select on item_photos for select to authenticated using (true);
create policy item_photos_insert on item_photos for insert to authenticated with check (true);
create policy item_photos_update on item_photos for update to authenticated using (true) with check (true);
create policy item_photos_delete on item_photos for delete to authenticated using (true);

drop policy if exists documents_select on documents;
drop policy if exists documents_insert on documents;
drop policy if exists documents_update on documents;
drop policy if exists documents_delete on documents;
create policy documents_select on documents for select to authenticated using (true);
create policy documents_insert on documents for insert to authenticated with check (true);
create policy documents_update on documents for update to authenticated using (true) with check (true);
create policy documents_delete on documents for delete to authenticated using (true);

drop policy if exists staff_profiles_select on staff_profiles;
drop policy if exists staff_profiles_insert on staff_profiles;
drop policy if exists staff_profiles_update on staff_profiles;
create policy staff_profiles_select on staff_profiles for select to authenticated using (true);
create policy staff_profiles_insert on staff_profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy staff_profiles_update on staff_profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
