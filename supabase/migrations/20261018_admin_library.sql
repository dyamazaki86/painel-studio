-- Catálogo compartilhado do Painel Studio, editável somente por admins.
create table if not exists public.library_categories (
  id text primary key,
  name text not null check (length(trim(name)) between 1 and 80),
  parent_id text references public.library_categories(id) on delete restrict,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists library_categories_parent_order_idx
  on public.library_categories (parent_id, sort_order, name);
create unique index if not exists library_categories_unique_name_per_parent_idx
  on public.library_categories ((coalesce(parent_id, '')), (lower(name)));

create table if not exists public.library_components (
  id text primary key,
  name text not null check (length(trim(name)) between 1 and 120),
  category_id text not null references public.library_categories(id) on delete restrict,
  width_mm numeric(8,2) not null check (width_mm > 0 and width_mm <= 3000),
  height_mm numeric(8,2) not null check (height_mm > 0 and height_mm <= 3000),
  color text not null default '#5aa8d8' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon text not null default '▦',
  image text,
  storage_path text,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists library_components_category_order_idx
  on public.library_components (category_id, sort_order, name);

alter table public.library_categories enable row level security;
alter table public.library_components enable row level security;
revoke all on table public.library_categories from anon;
revoke all on table public.library_components from anon;
grant select, insert, update, delete on table public.library_categories to authenticated;
grant select, insert, update, delete on table public.library_components to authenticated;

drop policy if exists library_categories_read_authenticated on public.library_categories;
create policy library_categories_read_authenticated
  on public.library_categories for select to authenticated using (true);
drop policy if exists library_categories_admin_write on public.library_categories;
create policy library_categories_admin_write
  on public.library_categories for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists library_components_read_authenticated on public.library_components;
create policy library_components_read_authenticated
  on public.library_components for select to authenticated using (true);
drop policy if exists library_components_admin_write on public.library_components;
create policy library_components_admin_write
  on public.library_components for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Component images are public to display in the editor and PNG exports;
-- only admins may upload, replace, or remove them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('library-assets', 'library-assets', true, 10485760, array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists library_assets_public_read on storage.objects;
create policy library_assets_public_read on storage.objects for select to public
  using (bucket_id = 'library-assets');
drop policy if exists library_assets_admin_insert on storage.objects;
create policy library_assets_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'library-assets' and (select public.is_admin()));
drop policy if exists library_assets_admin_update on storage.objects;
create policy library_assets_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'library-assets' and (select public.is_admin()))
  with check (bucket_id = 'library-assets' and (select public.is_admin()));
drop policy if exists library_assets_admin_delete on storage.objects;
create policy library_assets_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'library-assets' and (select public.is_admin()));

insert into public.library_categories (id, name, parent_id, sort_order) values
  ('protecao', 'Proteção', null, 0),
  ('comando', 'Comando', null, 1),
  ('bornes', 'Bornes', null, 2),
  ('canaletas', 'Canaletas', null, 3)
on conflict (id) do nothing;

insert into public.library_components (id, name, category_id, width_mm, height_mm, color, icon, image, sort_order, metadata) values
  ('d1', 'Disjuntor 1P', 'protecao', 18, 55, '#f4b740', '⚡', null, 0, '{}'),
  ('d2', 'Disjuntor 2P', 'protecao', 36, 55, '#f4b740', '⚡', null, 1, '{}'),
  ('cont', 'Contator 3P', 'comando', 45, 78, '#50b8a7', '⏚', null, 0, '{}'),
  ('weg-cwb38', 'Contator WEG CWB38 3P - 38 A', 'comando', 45, 85, '#50b8a7', '⏚', 'assets/components/weg-cwb38-frontal.png', 1, '{}'),
  ('weg-cwb80', 'Contator WEG CWB80 3P - 80 A', 'comando', 54, 115, '#50b8a7', '⏚', 'assets/components/weg-cwb80-frontal.png', 2, '{}'),
  ('weg-cwb125', 'Contator WEG CWB125 3P - 125 A', 'comando', 72, 148.6, '#50b8a7', '⏚', 'assets/components/weg-cwb125-frontal.png', 3, '{}'),
  ('rel', 'Relé térmico', 'comando', 45, 75, '#6a91e8', '◈', null, 4, '{}'),
  ('fonte', 'Fonte 24 Vcc', 'comando', 54, 90, '#a887dc', '⌁', null, 5, '{}'),
  ('clp', 'CLP compacto', 'comando', 70, 90, '#53a4d7', '▤', null, 6, '{}'),
  ('born', 'Borne de passagem', 'bornes', 6, 42, '#e98263', '⊞', null, 0, '{}'),
  ('canaleta-30', 'Canaleta 30 mm', 'canaletas', 200, 30, '#9ba8b8', '▥', null, 0, '{"fixedSection":30,"channelProfile":true,"resizable":true}'),
  ('canaleta-50', 'Canaleta 50 mm', 'canaletas', 200, 50, '#9ba8b8', '▥', null, 1, '{"fixedSection":50,"channelProfile":true,"resizable":true}'),
  ('canaleta-80', 'Canaleta 80 mm', 'canaletas', 200, 80, '#9ba8b8', '▥', null, 2, '{"fixedSection":80,"channelProfile":true,"resizable":true}')
on conflict (id) do nothing;
