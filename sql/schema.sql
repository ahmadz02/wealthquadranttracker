-- Wealth Quadrant Supabase schema
-- Run this in Supabase SQL Editor after enabling Email/Password Auth.

create type public.app_role as enum ('superadmin', 'premium');
create type public.approval_status as enum ('pending', 'approved', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  username text unique not null,
  role public.app_role not null default 'premium',
  status public.approval_status not null default 'pending',
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.wealth_month_data (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  year int not null,
  month int not null check (month between 0 and 11),
  data jsonb not null default '{}'::jsonb,
  storage_path text,
  updated_at timestamptz not null default now(),
  unique(user_id, year, month)
);

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin' and p.status = 'approved');
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, username, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
    coalesce((new.raw_user_meta_data->>'requested_role')::public.app_role, 'premium'),
    case when not exists (select 1 from public.profiles where role='superadmin' and status='approved')
         then 'approved'::public.approval_status
         else 'pending'::public.approval_status end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.wealth_month_data enable row level security;

create policy "profiles read self or superadmin" on public.profiles
for select to authenticated using (id = auth.uid() or public.is_superadmin());

create policy "superadmin updates profiles" on public.profiles
for update to authenticated using (public.is_superadmin()) with check (public.is_superadmin());

create policy "month data read own or superadmin" on public.wealth_month_data
for select to authenticated using (user_id = auth.uid() or public.is_superadmin());

create policy "premium writes own month data" on public.wealth_month_data
for insert to authenticated with check (user_id = auth.uid() or public.is_superadmin());

create policy "premium updates own month data" on public.wealth_month_data
for update to authenticated using (user_id = auth.uid() or public.is_superadmin()) with check (user_id = auth.uid() or public.is_superadmin());

create policy "premium deletes own month data" on public.wealth_month_data
for delete to authenticated using (user_id = auth.uid() or public.is_superadmin());

-- Storage bucket: create a private bucket named wealth-quadrant in Supabase Storage.
-- Storage policies for unique user folders.
create policy "storage read own folder or superadmin" on storage.objects
for select to authenticated using (bucket_id = 'wealth-quadrant' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_superadmin()));

create policy "storage write own folder or superadmin" on storage.objects
for insert to authenticated with check (bucket_id = 'wealth-quadrant' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_superadmin()));

create policy "storage update own folder or superadmin" on storage.objects
for update to authenticated using (bucket_id = 'wealth-quadrant' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_superadmin()));

create policy "storage delete own folder or superadmin" on storage.objects
for delete to authenticated using (bucket_id = 'wealth-quadrant' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_superadmin()));
