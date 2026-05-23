-- Per-movement building tag. Answers "what did this job cost in
-- materials?" by letting staff stamp every check-in/out with the
-- building the bulb went to. Combined with the cost snapshots from PR
-- 208, the Reports page can roll up spend per building.
--
-- The tag is optional. NULL is the common case (loose stock, restock,
-- internal moves). When set, the FK is on delete set null so a
-- building row can be removed without losing transaction history.

alter table transactions
  add column if not exists building_id uuid references buildings(id) on delete set null;

create index if not exists transactions_building_idx
  on transactions (building_id, occurred_at desc) where building_id is not null;

-- Widen record_movement to a 9-arg signature. The new p_building_id
-- defaults NULL so call sites that don't care keep working unchanged.
drop function if exists record_movement(uuid, text, integer, text, uuid, numeric, numeric, text);

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

  begin
    insert into transactions
      (item_id, direction, qty, staff_id, staff_label, note, idempotency_key,
       unit_cost_snapshot, max_price_snapshot, vendor_snapshot, building_id)
    values
      (p_item_id, p_direction, p_qty, v_user_id, v_staff, p_note, p_idempotency_key,
       p_unit_cost_snapshot, p_max_price_snapshot, p_vendor_snapshot, p_building_id)
    returning * into v_txn;
  exception when unique_violation then
    select * into v_txn
      from transactions
     where idempotency_key = p_idempotency_key;
    return v_txn;
  end;

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

revoke all     on function record_movement(uuid, text, integer, text, uuid, numeric, numeric, text, uuid) from public;
revoke execute on function record_movement(uuid, text, integer, text, uuid, numeric, numeric, text, uuid) from anon;
grant  execute on function record_movement(uuid, text, integer, text, uuid, numeric, numeric, text, uuid) to authenticated;
