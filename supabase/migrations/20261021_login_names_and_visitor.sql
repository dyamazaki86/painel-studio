-- Login names and restrictions for the public visitor profile.
alter table public.profiles add column if not exists username text;

with normalized as (
  select user_id,
    coalesce(nullif(left(regexp_replace(regexp_replace(lower(split_part(coalesce(email, ''), '@', 1)), '[^a-z0-9._-]', '', 'g'), '^[^a-z0-9]+', ''), 23), ''), 'usuario') as base
  from public.profiles
), ranked as (
  select user_id, base, row_number() over (partition by base order by user_id) as duplicate_number
  from normalized
)
update public.profiles as profile
set username = case
  when char_length(ranked.base) < 3 then 'user-' || left(ranked.user_id::text, 8)
  when ranked.duplicate_number = 1 then ranked.base
  else left(ranked.base, 23) || '-' || left(ranked.user_id::text, 8)
end
from ranked
where profile.user_id = ranked.user_id and profile.username is null;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'user', 'visitor'));
alter table public.profiles drop constraint if exists profiles_username_format_check;
alter table public.profiles add constraint profiles_username_format_check
  check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{2,31}$');
create unique index if not exists profiles_username_unique_idx on public.profiles (lower(username)) where username is not null;

create or replace function public.sync_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email, full_name, username)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(lower(new.raw_user_meta_data ->> 'username'), '')
  )
  on conflict (user_id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        username = coalesce(excluded.username, public.profiles.username),
        updated_at = now();
  return new;
end;
$$;
revoke all on function public.sync_auth_profile() from public;

create or replace function public.resolve_login_email(login_identifier text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select profile.email
  from public.profiles as profile
  where lower(profile.username) = lower(trim(login_identifier))
  limit 1;
$$;
revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

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
  if target_role not in ('admin', 'user', 'visitor') then
    raise exception 'Cargo inválido.' using errcode = '22023';
  end if;
  if target_user_id = (select auth.uid()) and target_role <> 'admin' then
    raise exception 'Não é permitido remover o próprio cargo de administrador.' using errcode = '42501';
  end if;
  if target_role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1
     and exists (select 1 from public.profiles where user_id = target_user_id and role = 'admin') then
    raise exception 'O sistema precisa manter pelo menos um administrador.' using errcode = '42501';
  end if;
  update public.profiles set role = target_role, updated_at = now() where user_id = target_user_id;
  if not found then raise exception 'Perfil não encontrado.' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.set_profile_role(uuid, text) from public;
grant execute on function public.set_profile_role(uuid, text) to authenticated;

create or replace function public.enforce_visitor_project_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare target_role text;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  select profile.role into target_role from public.profiles as profile where profile.user_id = new.user_id;
  if target_role = 'visitor' and exists (
    select 1 from public.projects as project
    where project.user_id = new.user_id and project.id <> new.id
  ) then
    raise exception 'A conta visitante pode salvar apenas um projeto.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_visitor_project_limit() from public;
drop trigger if exists visitor_project_limit on public.projects;
create trigger visitor_project_limit
  before insert or update of id, user_id on public.projects
  for each row execute function public.enforce_visitor_project_limit();
