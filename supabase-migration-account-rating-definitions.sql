-- Run this in Supabase Dashboard > SQL Editor if the account-specific
-- rating definitions table is missing.
create table if not exists public.melonpan_account_rating_definitions (
  id text not null,
  account_id uuid not null references public.melonpan_accounts(id) on delete cascade,
  label text not null,
  display_order integer not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (account_id, id)
);

alter table public.melonpan_account_rating_definitions enable row level security;

drop policy if exists "public shared melonpan account rating definitions"
  on public.melonpan_account_rating_definitions;
create policy "public shared melonpan account rating definitions"
  on public.melonpan_account_rating_definitions
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete
  on public.melonpan_account_rating_definitions to anon, authenticated;

notify pgrst, 'reload schema';
