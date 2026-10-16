-- Papéis geridos no banco; clientes autenticados podem ler, mas não alterar, a própria role.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists profiles_read_own_or_admin on public.profiles;
create policy profiles_read_own_or_admin
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

-- Existing accounts get the least-privileged role. Promote the first admin manually
-- through the Supabase SQL Editor after applying this migration.
insert into public.profiles (user_id, email, full_name)
select id, email, nullif(raw_user_meta_data ->> 'full_name', '')
from auth.users
on conflict (user_id) do update
  set email = excluded.email,
      full_name = excluded.full_name;

create or replace function public.sync_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (user_id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        updated_at = now();
  return new;
end;
$$;

revoke all on function public.sync_auth_profile() from public;
drop trigger if exists on_auth_user_profile_sync on auth.users;
create trigger on_auth_user_profile_sync
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.sync_auth_profile();

create or replace function public.set_profile_role(target_user_id uuid, target_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'Apenas administradores podem alterar cargos.' using errcode = '42501';
  end if;
  if target_role not in ('admin', 'user') then
    raise exception 'Cargo inválido.' using errcode = '22023';
  end if;
  if target_user_id = (select auth.uid()) and target_role <> 'admin' then
    raise exception 'Não é permitido remover o próprio cargo de administrador.' using errcode = '42501';
  end if;
  if target_role = 'user'
     and (select count(*) from public.profiles where role = 'admin') <= 1
     and exists (select 1 from public.profiles where user_id = target_user_id and role = 'admin') then
    raise exception 'O sistema precisa manter pelo menos um administrador.' using errcode = '42501';
  end if;
  update public.profiles
  set role = target_role, updated_at = now()
  where user_id = target_user_id;
  if not found then
    raise exception 'Perfil não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_profile_role(uuid, text) from public;
grant execute on function public.set_profile_role(uuid, text) to authenticated;

-- Admins can support all users' projects; regular users remain isolated to their own rows.
drop policy if exists projects_owner_all on public.projects;
create policy projects_owner_or_admin_all
  on public.projects
  for all
  to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()))
  with check ((select auth.uid()) = user_id or (select public.is_admin()));
