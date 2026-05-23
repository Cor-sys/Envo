-- Admin-gated RPC for changing a user's staff_profiles.role from the UI.
--
-- Without this, an admin who wanted to promote someone to admin (or
-- demote them back to staff) had to drop into the Supabase SQL editor.
-- The Admin page now exposes a per-row toggle backed by this function.
--
-- Security: the function is SECURITY DEFINER so it can write to a table
-- that the caller's RLS policy doesn't grant them direct UPDATE on, but
-- the body explicitly verifies the caller's role and rejects non-admins.
-- This is the same pattern as redeem_invite — server-side guard, not RLS
-- alone.

create or replace function set_staff_role(
  p_user_id uuid,
  p_role    text
) returns staff_profiles
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_caller_id uuid := auth.uid();
  v_caller    staff_profiles;
  v_updated   staff_profiles;
begin
  if v_caller_id is null then
    raise exception 'not authenticated';
  end if;
  if p_role not in ('admin', 'staff') then
    raise exception 'role must be ''admin'' or ''staff''';
  end if;

  select * into v_caller from staff_profiles where id = v_caller_id;
  if v_caller is null or v_caller.role <> 'admin' then
    raise exception 'admin role required';
  end if;

  -- Guard against an admin demoting themselves and locking the project
  -- out of admin actions. They can still do it via SQL if truly needed.
  if p_user_id = v_caller_id and p_role <> 'admin' then
    raise exception 'cannot demote yourself — ask another admin to do it';
  end if;

  update staff_profiles
     set role = p_role
   where id = p_user_id
   returning * into v_updated;

  if v_updated is null then
    raise exception 'staff profile % not found', p_user_id;
  end if;

  return v_updated;
end;
$$;

revoke all     on function set_staff_role(uuid, text) from public;
revoke execute on function set_staff_role(uuid, text) from anon;
grant  execute on function set_staff_role(uuid, text) to authenticated;
