-- 211 — Role-based access control (owner / admin / manager / staff)
--
-- Replaces the flat "any authenticated user can write everything" model
-- (today's RLS is `using(true)`) with a four-tier hierarchy enforced in the
-- DATABASE, not just the UI:
--
--   owner   — project owner + sole developer (full app + code/infra/data).
--   admin   — full app control: invites/accounts, role mgmt up to manager,
--             corrections / health batches. No code/infra access.
--   manager — stock + catalog + vendors/prices + orders/reports + buildings.
--   staff   — view + check TOOLS in/out + maps. Cannot touch stock or catalog.
--
-- Design notes:
--   * Reads stay open to all authenticated users (everyone can view inventory),
--     so the read-heavy app keeps working. Only WRITES are role-gated.
--   * The real write path for stock is record_movement() (SECURITY DEFINER,
--     which bypasses RLS), so the tools-vs-stock gate lives INSIDE it. The
--     transactions INSERT policy is a defense-in-depth backstop.
--   * role / is_active on staff_profiles are protected by a trigger so a user
--     can't escalate their own role with a direct UPDATE — changes must go
--     through set_staff_role().
--   * Safe-by-default data migration: viewer->staff, admin->manager
--     (under-privilege is recoverable; over-privilege is dangerous). The owner
--     is set explicitly by email.
--   * Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Role helpers
-- ---------------------------------------------------------------------------
create or replace function role_rank(p_role text) returns int
  language sql immutable
  set search_path = public, pg_temp
as $$
  select case p_role
    when 'owner'   then 4
    when 'admin'   then 3
    when 'manager' then 2
    when 'staff'   then 1
    else 0
  end;
$$;

-- has_role('manager') => true if the caller is an ACTIVE account ranked
-- >= manager. SECURITY DEFINER so it can read staff_profiles from inside RLS
-- policies on other tables without tripping recursion / their RLS.
create or replace function has_role(p_min text) returns boolean
  language sql stable security definer
  set search_path = public, pg_temp
as $$
  select role_rank((select role from staff_profiles
                      where id = auth.uid() and is_active = true))
         >= role_rank(p_min);
$$;

revoke all     on function role_rank(text) from public;
revoke all     on function has_role(text)  from public;
grant  execute on function role_rank(text) to authenticated;
grant  execute on function has_role(text)  to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Expand the role vocabulary + migrate existing rows (safe-by-default).
-- ---------------------------------------------------------------------------
alter table staff_profiles drop constraint if exists staff_profiles_role_check;

update staff_profiles set role = 'staff'   where role = 'viewer';
update staff_profiles set role = 'manager' where role = 'admin';

alter table staff_profiles
  add constraint staff_profiles_role_check
  check (role in ('owner','admin','manager','staff'));

-- ---------------------------------------------------------------------------
-- 3. Promote the project owner. Keyed off email (same pattern as migration
--    206) so it replays cleanly.
--    >>> CHANGE this to the email of the account that should be the owner
--    >>> before running on a fresh deployment.
-- ---------------------------------------------------------------------------
update staff_profiles p
   set role = 'owner', is_active = true
  from auth.users u
 where u.id = p.id
   and u.email = 'owner@example.com';

-- ---------------------------------------------------------------------------
-- 4. Protect role / is_active from direct client UPDATEs. Only a privileged
--    path (set_staff_role, which sets the flag below) may change them — closes
--    the "user updates their own role to owner" hole the self-update RLS policy
--    would otherwise allow. Created AFTER the step-2/3 data migration so those
--    UPDATEs aren't blocked.
-- ---------------------------------------------------------------------------
create or replace function protect_privileged_columns() returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  if (new.role is distinct from old.role
      or new.is_active is distinct from old.is_active)
     and coalesce(current_setting('app.privileged_role_change', true), '') <> '1'
  then
    raise exception 'role/is_active can only be changed via set_staff_role()';
  end if;
  return new;
end;
$$;

drop trigger if exists staff_profiles_protect_privileged on staff_profiles;
create trigger staff_profiles_protect_privileged
  before update on staff_profiles
  for each row execute function protect_privileged_columns();

-- ---------------------------------------------------------------------------
-- 5. set_staff_role — 4-tier hierarchy with escalation guards.
--      * only owner grants owner/admin
--      * nobody grants a role at/above their own rank (owner excepted)
--      * only owner may change an owner's role
--      * the owner can't demote themselves
-- ---------------------------------------------------------------------------
create or replace function set_staff_role(p_user_id uuid, p_role text)
  returns staff_profiles
  language plpgsql security definer
  set search_path = public, pg_temp
as $$
declare
  v_caller_role    text;
  v_caller_rank    int;
  v_target_current text;
  v_updated        staff_profiles;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_role not in ('owner','admin','manager','staff') then
    raise exception 'invalid role: %', p_role;
  end if;

  select role into v_caller_role
    from staff_profiles where id = auth.uid() and is_active = true;
  v_caller_rank := role_rank(v_caller_role);

  if v_caller_rank < role_rank('admin') then
    raise exception 'admin or owner role required to manage roles';
  end if;
  if p_role in ('owner','admin') and v_caller_role <> 'owner' then
    raise exception 'only the owner can grant owner/admin';
  end if;
  if role_rank(p_role) >= v_caller_rank and v_caller_role <> 'owner' then
    raise exception 'cannot grant a role at or above your own';
  end if;

  select role into v_target_current from staff_profiles where id = p_user_id;
  if v_target_current = 'owner' and v_caller_role <> 'owner' then
    raise exception 'only the owner can change an owner''s role';
  end if;
  if p_user_id = auth.uid() and v_caller_role = 'owner' and p_role <> 'owner' then
    raise exception 'the owner cannot demote themselves';
  end if;

  perform set_config('app.privileged_role_change', '1', true);
  update staff_profiles set role = p_role
    where id = p_user_id returning * into v_updated;
  if v_updated is null then
    raise exception 'staff profile % not found', p_user_id;
  end if;
  return v_updated;
end;
$$;

revoke all     on function set_staff_role(uuid, text) from public;
revoke execute on function set_staff_role(uuid, text) from anon;
grant  execute on function set_staff_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. record_movement — add the role gate. Staff may move ONLY tools; stock
--    (non-tool) movements require manager+. Enforced here because this
--    SECURITY DEFINER function is the real write path and bypasses RLS.
--    Body otherwise identical to schema.sql.
-- ---------------------------------------------------------------------------
create or replace function record_movement(
  p_item_id            uuid,
  p_direction          text,
  p_qty                integer,
  p_note               text          default null,
  p_idempotency_key    uuid          default null,
  p_unit_cost_snapshot numeric(10,2) default null,
  p_max_price_snapshot numeric(10,2) default null,
  p_vendor_snapshot    text          default null,
  p_building_id        uuid          default null
) returns transactions
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_user_id   uuid := auth.uid();
  v_staff     text;
  v_item_type text;
  v_new_qty   integer;
  v_txn       transactions;
begin
  if p_direction not in ('in', 'out') then
    raise exception 'direction must be ''in'' or ''out''';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'qty must be a positive integer';
  end if;

  -- Role gate. Look up the item type, then enforce tools-vs-stock.
  select item_type into v_item_type
    from items where id = p_item_id and deleted_at is null;
  if v_item_type is null then
    raise exception 'item % not found (or deleted)', p_item_id;
  end if;
  if not has_role('staff') then
    raise exception 'inactive or unknown account';
  end if;
  if v_item_type <> 'tool' and not has_role('manager') then
    raise exception 'staff can only check tools in/out; stock movements require a manager';
  end if;

  if v_user_id is not null then
    select coalesce(raw_user_meta_data->>'full_name', email)
      into v_staff from auth.users where id = v_user_id;
  end if;

  begin
    insert into transactions
      (item_id, direction, qty, staff_id, staff_label, note, idempotency_key,
       unit_cost_snapshot, max_price_snapshot, vendor_snapshot, building_id)
    values
      (p_item_id, p_direction, p_qty, v_user_id, v_staff, p_note, p_idempotency_key,
       p_unit_cost_snapshot, p_max_price_snapshot, p_vendor_snapshot, p_building_id)
    returning * into v_txn;
  exception when unique_violation then
    select * into v_txn from transactions where idempotency_key = p_idempotency_key;
    return v_txn;
  end;

  update items
     set qty = case when p_direction = 'in' then qty + p_qty else qty - p_qty end
   where id = p_item_id and deleted_at is null
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

revoke all     on function record_movement(uuid, text, integer, text, uuid, numeric, numeric, text, uuid) from public;
revoke execute on function record_movement(uuid, text, integer, text, uuid, numeric, numeric, text, uuid) from anon;
grant  execute on function record_movement(uuid, text, integer, text, uuid, numeric, numeric, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. RLS — replace wide-open write policies with role-gated ones.
--    SELECT policies are left as-is (all authenticated can read).
-- ---------------------------------------------------------------------------

-- items: write = manager+; hard delete = admin+ (soft-delete is an UPDATE).
drop policy if exists items_insert on items;
drop policy if exists items_update on items;
drop policy if exists items_delete on items;
create policy items_insert on items for insert to authenticated
  with check (has_role('manager'));
create policy items_update on items for update to authenticated
  using (has_role('manager')) with check (has_role('manager'));
create policy items_delete on items for delete to authenticated
  using (has_role('admin'));

-- transactions: backstop for direct inserts (real gate is record_movement).
-- staff may insert only for tool items; manager+ for anything.
drop policy if exists transactions_insert on transactions;
create policy transactions_insert on transactions for insert to authenticated
  with check (
    (staff_id is null or staff_id = (select auth.uid()))
    and has_role('staff')
    and (
      has_role('manager')
      or exists (select 1 from items i where i.id = item_id and i.item_type = 'tool')
    )
  );

-- suppliers: manager+
drop policy if exists suppliers_insert on suppliers;
drop policy if exists suppliers_update on suppliers;
drop policy if exists suppliers_delete on suppliers;
create policy suppliers_insert on suppliers for insert to authenticated with check (has_role('manager'));
create policy suppliers_update on suppliers for update to authenticated using (has_role('manager')) with check (has_role('manager'));
create policy suppliers_delete on suppliers for delete to authenticated using (has_role('manager'));

-- locations: manager+
drop policy if exists locations_insert on locations;
drop policy if exists locations_update on locations;
drop policy if exists locations_delete on locations;
create policy locations_insert on locations for insert to authenticated with check (has_role('manager'));
create policy locations_update on locations for update to authenticated using (has_role('manager')) with check (has_role('manager'));
create policy locations_delete on locations for delete to authenticated using (has_role('manager'));

-- tags: manager+
drop policy if exists tags_insert on tags;
drop policy if exists tags_update on tags;
drop policy if exists tags_delete on tags;
create policy tags_insert on tags for insert to authenticated with check (has_role('manager'));
create policy tags_update on tags for update to authenticated using (has_role('manager')) with check (has_role('manager'));
create policy tags_delete on tags for delete to authenticated using (has_role('manager'));

-- item_tags: manager+
drop policy if exists item_tags_insert on item_tags;
drop policy if exists item_tags_delete on item_tags;
create policy item_tags_insert on item_tags for insert to authenticated with check (has_role('manager'));
create policy item_tags_delete on item_tags for delete to authenticated using (has_role('manager'));

-- item_photos: manager+
drop policy if exists item_photos_insert on item_photos;
drop policy if exists item_photos_update on item_photos;
drop policy if exists item_photos_delete on item_photos;
create policy item_photos_insert on item_photos for insert to authenticated with check (has_role('manager'));
create policy item_photos_update on item_photos for update to authenticated using (has_role('manager')) with check (has_role('manager'));
create policy item_photos_delete on item_photos for delete to authenticated using (has_role('manager'));

-- documents: manager+
drop policy if exists documents_insert on documents;
drop policy if exists documents_update on documents;
drop policy if exists documents_delete on documents;
create policy documents_insert on documents for insert to authenticated with check (has_role('manager'));
create policy documents_update on documents for update to authenticated using (has_role('manager')) with check (has_role('manager'));
create policy documents_delete on documents for delete to authenticated using (has_role('manager'));

-- item_prices: was admin-only -> manager+ (managers do pricing/vendors).
drop policy if exists item_prices_admin_write   on item_prices;
drop policy if exists item_prices_manager_write on item_prices;
create policy item_prices_manager_write on item_prices for all to authenticated
  using (has_role('manager')) with check (has_role('manager'));

-- buildings + building_items: were admin-only -> manager+.
drop policy if exists buildings_admin_write   on buildings;
drop policy if exists buildings_manager_write on buildings;
create policy buildings_manager_write on buildings for all to authenticated
  using (has_role('manager')) with check (has_role('manager'));

drop policy if exists building_items_admin_write   on building_items;
drop policy if exists building_items_manager_write on building_items;
create policy building_items_manager_write on building_items for all to authenticated
  using (has_role('manager')) with check (has_role('manager'));

-- invites: admin+ (account creation is privileged).
drop policy if exists invites_admin_select on invites;
drop policy if exists invites_admin_write  on invites;
create policy invites_admin_select on invites for select to authenticated
  using (has_role('admin'));
create policy invites_admin_write on invites for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));
