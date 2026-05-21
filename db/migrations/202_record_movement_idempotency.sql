-- Adds idempotency_key to transactions so offline-queue retries can't
-- double-apply a movement. The client generates a UUID per queued movement;
-- on retry, the unique constraint short-circuits the RPC and the original
-- transaction is returned without touching qty.

alter table transactions
  add column if not exists idempotency_key uuid;

create unique index if not exists transactions_idempotency_key_uniq
  on transactions (idempotency_key)
  where idempotency_key is not null;

-- record_movement now takes an optional p_idempotency_key. The new signature
-- supersedes the old one — drop the 4-arg variant so the planner can't pick
-- the wrong overload from a stale prepared-statement cache.
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

  -- Insert the txn first. The unique idempotency_key acts as a reservation —
  -- a concurrent retry blocks until this txn commits or rolls back, then
  -- sees the existing row and returns it without re-applying.
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

  -- Same txn as the insert: if the qty update fails (item missing, would go
  -- negative), the txn row above also rolls back. Clean retry semantics.
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
