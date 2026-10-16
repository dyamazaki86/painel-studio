-- Painel Studio: projetos privados associados a cada conta Supabase Auth.
create table if not exists public.projects (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_updated_idx
  on public.projects (user_id, updated_at desc);

alter table public.projects enable row level security;
revoke all on table public.projects from anon;
grant select, insert, update, delete on table public.projects to authenticated;

drop policy if exists projects_owner_all on public.projects;
create policy projects_owner_all
  on public.projects
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
