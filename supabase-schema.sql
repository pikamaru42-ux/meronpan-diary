-- Supabase Dashboard の SQL Editor で一度だけ実行します。
create table if not exists public.melonpan_records (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  eaten_at date not null,
  shop text not null default '',
  product_name text not null,
  photo_path text,
  overall_rating smallint not null check (overall_rating between 1 and 5),
  memo text not null default '',
  tags text[] not null default '{}',
  custom_ratings jsonb not null default '{}',
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create table if not exists public.rating_definitions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null,
  display_order integer not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.melonpan_records enable row level security;
alter table public.rating_definitions enable row level security;
create policy "own melonpan records" on public.melonpan_records for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rating definitions" on public.rating_definitions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
insert into storage.buckets (id, name, public) values ('melonpan-photos', 'melonpan-photos', false) on conflict (id) do nothing;
create policy "own melonpan photos" on storage.objects for all to authenticated using (bucket_id = 'melonpan-photos' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'melonpan-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
