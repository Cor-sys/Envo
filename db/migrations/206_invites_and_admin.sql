-- Invite-only auth model (BRIEF Sec 3 + new requirement: only the admin can
-- onboard staff; nobody can self-register against the public URL).
--
-- What this migration does:
--   1. Adds `username` to staff_profiles so people can log in without ever
--      seeing an email address.
--   2. Creates the `invites` table — the source of truth for who's allowed
--      to redeem a fresh account.
--   3. Tightens RLS so only admins can mint or list invites.
--   4. Adds a SECURITY DEFINER RPC `get_email_for_username` so the public
--      login form can translate "ryder" → the synthetic email it has to
--      pass to supabase.auth.signInWithPassword (real email is never
--      revealed to the client).
--   5. Promotes the project owner to admin (one upsert).

-- ---------------------------------------------------------------------------
-- 1. username column on staff_profiles
-- ---------------------------------------------------------------------------
alter table staff_profiles
  add column if not exists username text;

create unique index if not exists staff_profiles_username_uniq
  on staff_profiles (lower(username))
  where username is not null;

-- ---------------------------------------------------------------------------
-- 2. invites table
--    code      — opaque 16-byte random string the admin shares out-of-band
--    used_by   — set when the code is redeemed (nullable until then)
--    expires_at — optional; an invite without an expiry is permanent until used
-- ---------------------------------------------------------------------------
create table if not exists invites (
  id          uuid        primary key default gen_random_uuid(),
  code        text        not null unique,
  created_by  uuid        not null references auth.users(id),
  used_by     uuid        references auth.users(id),
  used_at     timestamptz,
  expires_at  timestamptz,
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists invites_created_by_idx on invites (created_by);
create index if not exists invites_unused_idx on invites (used_at) where used_at is null;

alter table invites enable row level security;

-- Admins can read and manage invites. Regular staff can't see them at all —
-- the redemption RPC runs as SECURITY DEFINER and bypasses RLS for the
-- specific code being redeemed.
drop policy if exists invites_admin_select on invites;
drop policy if exists invites_admin_write  on invites;
create policy invites_admin_select on invites for select to authenticated using (
  exists (select 1 from staff_profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy invites_admin_write on invites for all to authenticated using (
  exists (select 1 from staff_profiles p where p.id = auth.uid() and p.role = 'admin')
) with check (
  exists (select 1 from staff_profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- ---------------------------------------------------------------------------
-- 3. RPC: username → email
--    Public login form needs the email to call signInWithPassword, but we
--    don't want to expose staff_profiles or auth.users to anonymous reads.
--    This SECURITY DEFINER function returns ONLY the email for an exact
--    username match, nothing else, and it's callable by anon — that's the
--    one piece of leakage we tolerate (an attacker can probe whether a
--    given username exists, no different from any other login system).
-- ---------------------------------------------------------------------------
create or replace function get_email_for_username(p_username text)
  returns text
  language plpgsql
  security definer
  set search_path = public, auth, pg_temp
as $$
declare
  v_email text;
begin
  if p_username is null or length(trim(p_username)) = 0 then
    return null;
  end if;

  select u.email
    into v_email
    from staff_profiles p
    join auth.users u on u.id = p.id
   where lower(p.username) = lower(trim(p_username))
   limit 1;

  return v_email;
end;
$$;

revoke all     on function get_email_for_username(text) from public;
grant  execute on function get_email_for_username(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Promote the project owner to admin.
--    Lookups by email rather than hard-coded UUID so this migration replays
--    cleanly in a fresh local environment that the owner has signed into.
--    >>> CHANGE this to the email of the account that should be the first admin
--    >>> (the one you signed in with) before running on a fresh deployment.
-- ---------------------------------------------------------------------------
insert into staff_profiles (id, full_name, role, is_active, username)
select u.id,
       coalesce(u.raw_user_meta_data->>'full_name', 'Admin'),
       'admin',
       true,
       'admin'
  from auth.users u
 where u.email = 'owner@example.com'
on conflict (id) do update
  set role = 'admin',
      is_active = true,
      username = coalesce(staff_profiles.username, 'admin');
