-- Show the lid catalog as one main category with its existing sections nested below.
insert into public.library_categories (id, name, parent_id, sort_order, side)
values ('lid-main', 'Tampa', null, 0, 'lid')
on conflict (id) do nothing;

update public.library_categories
set parent_id = 'lid-main'
where side = 'lid'
  and id in ('lid-buttons', 'lid-pilot-lights', 'lid-identification')
  and parent_id is distinct from 'lid-main';
