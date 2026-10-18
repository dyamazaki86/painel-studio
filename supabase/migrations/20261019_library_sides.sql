-- Separate the shared component catalog by enclosure side. Existing rows are
-- retained as backplane items; the current lid defaults become shared rows.
alter table public.library_categories
  add column if not exists side text not null default 'back';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'library_categories_side_check'
      and conrelid = 'public.library_categories'::regclass
  ) then
    alter table public.library_categories
      add constraint library_categories_side_check check (side in ('back', 'lid'));
  end if;
end $$;

drop index if exists public.library_categories_parent_order_idx;
create index if not exists library_categories_side_parent_order_idx
  on public.library_categories (side, parent_id, sort_order, name);

drop index if exists public.library_categories_unique_name_per_parent_idx;
create unique index if not exists library_categories_unique_name_per_side_parent_idx
  on public.library_categories (side, (coalesce(parent_id, '')), (lower(name)));

insert into public.library_categories (id, name, parent_id, sort_order, side) values
  ('lid-buttons', 'Botões', null, 0, 'lid'),
  ('lid-pilot-lights', 'Sinalizadores', null, 1, 'lid'),
  ('lid-identification', 'Identificação', null, 2, 'lid')
on conflict (id) do nothing;

insert into public.library_components
  (id, name, category_id, width_mm, height_mm, color, icon, sort_order, metadata)
values
  ('lid-button-green', 'Botão verde Ø22 mm', 'lid-buttons', 22, 22, '#32a878', '', 0, '{"shape":"circle"}'),
  ('lid-button-red', 'Botão vermelho Ø22 mm', 'lid-buttons', 22, 22, '#dc5963', '', 1, '{"shape":"circle"}'),
  ('lid-emergency-stop', 'Botão de emergência Ø40 mm', 'lid-buttons', 40, 40, '#e44848', '', 2, '{"shape":"circle"}'),
  ('lid-selector', 'Chave seletora Ø22 mm', 'lid-buttons', 22, 22, '#43546d', '↔', 3, '{"shape":"circle"}'),
  ('lid-pilot-green', 'Sinalizador verde Ø22 mm', 'lid-pilot-lights', 22, 22, '#39ae79', '', 0, '{"shape":"circle"}'),
  ('lid-pilot-red', 'Sinalizador vermelho Ø22 mm', 'lid-pilot-lights', 22, 22, '#db5360', '', 1, '{"shape":"circle"}'),
  ('lid-pilot-yellow', 'Sinalizador amarelo Ø22 mm', 'lid-pilot-lights', 22, 22, '#e8b73b', '', 2, '{"shape":"circle"}'),
  ('lid-id-plate', 'Placa de identificação 60 × 20 mm', 'lid-identification', 60, 20, '#e7ebf1', 'ID', 0, '{}')
on conflict (id) do nothing;
