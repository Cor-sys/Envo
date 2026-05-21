-- Stockroom — Supabase / Postgres schema
-- Run this in the Supabase SQL editor (or `psql -f db/schema.sql` against a self-hosted instance).
-- Idempotent: safe to re-run on a fresh project.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;  -- gen_random_uuid()

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
-- items
-- ---------------------------------------------------------------------------
create table if not exists items (
  id          uuid        primary key default gen_random_uuid(),
  sku         text        not null unique default next_stk_sku(),
  category    text        not null,
  brand       text,
  watts       text,                          -- text so '?' is allowed
  name        text        not null,
  base        text,                          -- e.g. 'G13 medium bipin'
  type        text,                          -- e.g. 'T8 fluorescent'
  model       text,                          -- manufacturer model / order code
  barcode     text        unique,            -- factory UPC; null if none
  qty         integer     not null default 0 check (qty >= 0),
  threshold   integer     not null default 0 check (threshold >= 0),
  location    text,                          -- shelf/bin code
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists items_category_idx on items (category);
create index if not exists items_location_idx on items (location);
-- Partial index lets us cheaply find rows that need a printed QR label.
create index if not exists items_no_barcode_idx on items (id) where barcode is null;

create or replace function set_updated_at() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists items_set_updated_at on items;
create trigger items_set_updated_at
  before update on items
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- transactions: immutable activity log (§8.2 — log is source of truth).
-- ---------------------------------------------------------------------------
create table if not exists transactions (
  id           uuid        primary key default gen_random_uuid(),
  item_id      uuid        not null references items(id) on delete restrict,
  direction    text        not null check (direction in ('in', 'out')),
  qty          integer     not null check (qty > 0),
  staff_id     uuid        references auth.users(id),
  staff_label  text,                         -- denormalized name for display even if user is deleted
  note         text,                         -- free text: job / customer / reason
  occurred_at  timestamptz not null default now()
);

create index if not exists transactions_item_idx     on transactions (item_id, occurred_at desc);
create index if not exists transactions_occurred_idx on transactions (occurred_at desc);
-- Cover the FK to auth.users so "who logged this?" lookups stay indexed.
create index if not exists transactions_staff_idx    on transactions (staff_id);

-- Enforce immutability: no UPDATE or DELETE on the activity log.
create or replace function transactions_immutable() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
begin
  raise exception 'transactions are immutable (use a compensating row instead)';
end;
$$;

drop trigger if exists transactions_no_update on transactions;
create trigger transactions_no_update
  before update on transactions
  for each row execute function transactions_immutable();

drop trigger if exists transactions_no_delete on transactions;
create trigger transactions_no_delete
  before delete on transactions
  for each row execute function transactions_immutable();

-- ---------------------------------------------------------------------------
-- record_movement: atomic check-in / check-out (§8.1).
-- Clients MUST use this RPC, never a raw UPDATE on items.qty, so concurrent
-- scans cannot clobber each other.
-- ---------------------------------------------------------------------------
create or replace function record_movement(
  p_item_id    uuid,
  p_direction  text,
  p_qty        integer,
  p_note       text default null
) returns transactions
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_user_id    uuid := auth.uid();
  v_staff      text;
  v_new_qty    integer;
  v_txn        transactions;
begin
  if p_direction not in ('in', 'out') then
    raise exception 'direction must be ''in'' or ''out''';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'qty must be a positive integer';
  end if;

  -- Atomic adjust: the row is locked by UPDATE, so simultaneous scans serialize.
  update items
     set qty = case when p_direction = 'in'
                    then qty + p_qty
                    else qty - p_qty
               end
   where id = p_item_id
   returning qty into v_new_qty;

  if not found then
    raise exception 'item % not found', p_item_id;
  end if;
  if v_new_qty < 0 then
    raise exception 'check-out would drop qty below zero';
  end if;

  -- Resolve a friendly staff label from auth metadata, falling back to email.
  select coalesce(raw_user_meta_data->>'full_name', email)
    into v_staff
    from auth.users
   where id = v_user_id;

  insert into transactions (item_id, direction, qty, staff_id, staff_label, note)
  values (p_item_id, p_direction, p_qty, v_user_id, v_staff, p_note)
  returning * into v_txn;

  return v_txn;
end;
$$;

revoke all     on function record_movement(uuid, text, integer, text) from public;
revoke execute on function record_movement(uuid, text, integer, text) from anon;
grant  execute on function record_movement(uuid, text, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Convenience views
-- ---------------------------------------------------------------------------

-- status: derived per §7. OUT if qty<=0; LOW if qty<=threshold; else OK.
-- security_invoker = true so the view applies the caller's RLS on items,
-- not the view owner's (default Postgres behavior leaks past RLS otherwise).
create or replace view items_with_status with (security_invoker = true) as
  select i.*,
         case
           when i.qty <= 0           then 'out'
           when i.qty <= i.threshold then 'low'
           else                            'ok'
         end as status,
         (i.barcode is null) as needs_label
    from items i;

-- Reorder list: every non-OK item with a suggested quantity that brings it up
-- to threshold. (Box-size rounding is a v1.1 concern — see BRIEF.md §14.)
create or replace view reorder_list with (security_invoker = true) as
  select i.id,
         i.sku,
         i.name,
         i.brand,
         i.category,
         i.qty,
         i.threshold,
         i.location,
         greatest(i.threshold - i.qty, 1) as suggested_qty,
         case when i.qty <= 0 then 'out' else 'low' end as status
    from items i
   where i.qty <= i.threshold
   order by (case when i.qty <= 0 then 0 else 1 end), i.category, i.name;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- v1: everyone signed in can read and edit (§3 — flat staff role). Admin/staff
-- split is a future change; the policies are split per-action so we can tighten
-- write/delete later without touching read.
--
-- Supabase's linter will flag insert/update/delete policies below as "always
-- true" — that is intentional for v1. When we introduce roles, replace each
-- `true` with a check against an `is_admin` or `staff_role` column.
-- ---------------------------------------------------------------------------
alter table items        enable row level security;
alter table transactions enable row level security;

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
-- Direct inserts are allowed (for back-dated reconciliation) but the normal
-- write path is the record_movement() RPC.
-- (select auth.uid()) instead of bare auth.uid() so Postgres evaluates it
-- once per statement rather than once per row.
create policy transactions_insert on transactions for insert to authenticated
  with check (staff_id is null or staff_id = (select auth.uid()));

-- Views inherit RLS from their base tables, so no extra policy needed for
-- items_with_status / reorder_list.
