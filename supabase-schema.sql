<<<<<<< HEAD
-- Supabase Dashboard の SQL Editor で一度だけ実行します。
create table if not exists public.melonpan_records (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  eaten_at date not null,
  shop text not null default '',
=======
-- Run in Supabase SQL Editor to add the unauthenticated shared board.
-- Existing private tables and the melonpan-photos bucket are intentionally left unchanged.

create table if not exists public.melonpan_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists public.melonpan_shared_records (
  id uuid primary key,
  account_id uuid not null references public.melonpan_accounts(id),
  eaten_at date not null,
  shop text not null default '',
  amount integer check (amount is null or amount >= 0),
>>>>>>> 37dd6223469b4672637aa992cefcdd02e9e9496f
  product_name text not null,
  photo_path text,
  overall_rating smallint not null check (overall_rating between 1 and 5),
  memo text not null default '',
<<<<<<< HEAD
  tags text[] not null default '{}',
=======
  tags jsonb not null default '[]'::jsonb,
>>>>>>> 37dd6223469b4672637aa992cefcdd02e9e9496f
  custom_ratings jsonb not null default '{}',
  created_at timestamptz not null,
  updated_at timestamptz not null
);
<<<<<<< HEAD
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
=======

alter table public.melonpan_shared_records
  add column if not exists amount integer check (amount is null or amount >= 0);

create table if not exists public.melonpan_account_rating_definitions (
  id text not null,
  account_id uuid not null references public.melonpan_accounts(id) on delete cascade,
  label text not null,
  display_order integer not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (account_id, id)
);

create index if not exists melonpan_shared_records_account_id_idx
  on public.melonpan_shared_records(account_id);

alter table public.melonpan_accounts enable row level security;
alter table public.melonpan_shared_records enable row level security;
alter table public.melonpan_account_rating_definitions enable row level security;

drop policy if exists "public read melonpan accounts" on public.melonpan_accounts;
create policy "public read melonpan accounts" on public.melonpan_accounts
  for select to anon, authenticated using (true);

drop policy if exists "public shared melonpan records" on public.melonpan_shared_records;
create policy "public shared melonpan records" on public.melonpan_shared_records
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "public shared melonpan account rating definitions" on public.melonpan_account_rating_definitions;
create policy "public shared melonpan account rating definitions" on public.melonpan_account_rating_definitions
  for all to anon, authenticated using (true) with check (true);

grant select on public.melonpan_accounts to anon, authenticated;
grant select, insert, update, delete on public.melonpan_shared_records, public.melonpan_account_rating_definitions to anon, authenticated;

insert into storage.buckets (id, name, public)
values ('melonpan-shared-photos', 'melonpan-shared-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "public shared melonpan photos" on storage.objects;
create policy "public shared melonpan photos" on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'melonpan-shared-photos')
  with check (bucket_id = 'melonpan-shared-photos');

grant select, insert, update, delete on storage.objects to anon, authenticated;
>>>>>>> 37dd6223469b4672637aa992cefcdd02e9e9496f
