-- ============================================================
-- EduUganda — Supabase schema, security policies, and seed data
-- Run this once in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. PROFILES (one row per student/admin, linked to Supabase Auth)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  phone text,
  level text,
  class text,
  paid boolean default false,
  paid_at timestamptz,
  disabled boolean default false,
  is_admin boolean default false,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
grant select, insert, update on public.profiles to authenticated;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;

-- Read admin status without recursively applying the profiles policies.
create or replace function public.is_admin_user()
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  );
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.is_paid_user()
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and paid = true
  );
end;
$$ language plpgsql security definer set search_path = public;

create policy "profiles_select_own_or_admin" on public.profiles
  for select using (
    auth.uid() = id
    or public.is_admin_user()
  );

create policy "profiles_update_own_or_admin" on public.profiles
  for update using (
    auth.uid() = id
    or public.is_admin_user()
  );

create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- Prevent a normal user from promoting themselves to admin or un-disabling themselves
create or replace function public.protect_privileged_columns()
returns trigger as $$
declare
  is_caller_admin boolean;
begin
  if auth.uid() is null then
    return new;
  end if;
  select is_admin into is_caller_admin from public.profiles where id = auth.uid();
  if not coalesce(is_caller_admin, false) then
    new.is_admin := old.is_admin;
    new.disabled := old.disabled;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists protect_privileged_columns_trigger on public.profiles;
create trigger protect_privileged_columns_trigger
  before update on public.profiles
  for each row execute function public.protect_privileged_columns();

-- Auto-create a profile row whenever someone signs up via Supabase Auth
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name, phone, level, class)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'level',
    new.raw_user_meta_data->>'class'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. SETTINGS (single row: receiving accounts for MTN / Airtel / bank)
create table if not exists public.settings (
  id int primary key default 1,
  payments_enabled boolean default false,
  mtn text default '0770000000',
  airtel text default '0750000000',
  bank_name text default 'Stanbic Bank Uganda',
  bank_account text default '0100000000',
  bank_holder text default 'EduUganda Ltd',
  constraint settings_single_row check (id = 1)
);

alter table public.settings add column if not exists live_enabled boolean default false;
alter table public.settings add column if not exists live_title text default 'Physics Revision';
alter table public.settings add column if not exists live_class text default '';
alter table public.settings add column if not exists live_date date;
alter table public.settings add column if not exists live_start time default '10:00';
alter table public.settings add column if not exists live_end time default '11:00';
alter table public.settings add column if not exists live_url text default '';

insert into public.settings (id) values (1) on conflict (id) do nothing;

alter table public.settings enable row level security;
grant select, update on public.settings to authenticated;

drop policy if exists "settings_select_all" on public.settings;
drop policy if exists "settings_update_admin_only" on public.settings;

create policy "settings_select_all" on public.settings
  for select using (true);

create policy "settings_update_admin_only" on public.settings
  for update using (
    public.is_admin_user()
  );

-- 3. SUBJECTS
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

alter table public.subjects enable row level security;
grant select, insert, delete on public.subjects to authenticated;

drop policy if exists "subjects_select_all" on public.subjects;
drop policy if exists "subjects_admin_write" on public.subjects;
drop policy if exists "subjects_admin_delete" on public.subjects;

create policy "subjects_select_all" on public.subjects for select using (true);
create policy "subjects_admin_write" on public.subjects for insert with check (
  public.is_admin_user()
);
create policy "subjects_admin_delete" on public.subjects for delete using (
  public.is_admin_user()
);

-- 4. CLASSES
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  sort_order int default 0
);

alter table public.classes enable row level security;
grant select, insert, delete on public.classes to authenticated;

drop policy if exists "classes_select_all" on public.classes;
drop policy if exists "classes_admin_write" on public.classes;
drop policy if exists "classes_admin_delete" on public.classes;

create policy "classes_select_all" on public.classes for select using (true);
create policy "classes_admin_write" on public.classes for insert with check (
  public.is_admin_user()
);
create policy "classes_admin_delete" on public.classes for delete using (
  public.is_admin_user()
);

-- 4b. DISCUSSION GROUPS
create table if not exists public.discussion_groups (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  description text,
  created_at timestamptz default now()
);

create table if not exists public.group_members (
  group_id uuid references public.discussion_groups(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);

alter table public.discussion_groups enable row level security;
alter table public.group_members enable row level security;
grant select, insert, delete on public.discussion_groups to authenticated;
grant select, insert, delete on public.group_members to authenticated;

drop policy if exists "groups_select_authenticated" on public.discussion_groups;
drop policy if exists "groups_admin_insert" on public.discussion_groups;
drop policy if exists "groups_admin_delete" on public.discussion_groups;
drop policy if exists "group_members_select_authenticated" on public.group_members;
drop policy if exists "group_members_insert_own" on public.group_members;
drop policy if exists "group_members_delete_own_or_admin" on public.group_members;

create policy "groups_select_authenticated" on public.discussion_groups
  for select to authenticated using (true);
create policy "groups_admin_insert" on public.discussion_groups
  for insert to authenticated with check (public.is_admin_user());
create policy "groups_admin_delete" on public.discussion_groups
  for delete to authenticated using (public.is_admin_user());
create policy "group_members_select_authenticated" on public.group_members
  for select to authenticated using (true);
create policy "group_members_insert_own" on public.group_members
  for insert to authenticated with check (auth.uid() = user_id);
create policy "group_members_delete_own_or_admin" on public.group_members
  for delete to authenticated using (auth.uid() = user_id or public.is_admin_user());

-- 5. VIDEOS (lesson library)
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text,
  class text,
  topic text,
  duration text,
  views text default '0',
  thumb text,
  url text not null,
  notes text,
  description text,
  created_at timestamptz default now()
);

alter table public.videos enable row level security;
grant select, insert, update, delete on public.videos to authenticated;

drop policy if exists "videos_select_gated" on public.videos;
drop policy if exists "videos_admin_write" on public.videos;
drop policy if exists "videos_admin_update" on public.videos;
drop policy if exists "videos_admin_delete" on public.videos;

create policy "videos_select_gated" on public.videos
  for select using (
    auth.role() = 'authenticated' and (
      not exists (select 1 from public.settings where id = 1 and payments_enabled = true)
      or public.is_admin_user()
      or public.is_paid_user()
    )
  );

create policy "videos_admin_write" on public.videos for insert with check (
  public.is_admin_user()
);
create policy "videos_admin_update" on public.videos for update using (
  public.is_admin_user()
);
create policy "videos_admin_delete" on public.videos for delete using (
  public.is_admin_user()
);

-- 6. PAYMENTS (record of each term payment)
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  amount numeric,
  method text,
  status text default 'paid',
  created_at timestamptz default now()
);

alter table public.payments enable row level security;

create policy "payments_select_own_or_admin" on public.payments for select using (
  auth.uid() = user_id
  or public.is_admin_user()
);
create policy "payments_insert_own" on public.payments for insert with check (auth.uid() = user_id);

-- 7. WATCH PROGRESS
create table if not exists public.watch_progress (
  user_id uuid references public.profiles(id),
  video_id uuid references public.videos(id),
  watched_at timestamptz default now(),
  primary key (user_id, video_id)
);

alter table public.watch_progress enable row level security;

create policy "progress_select_own" on public.watch_progress for select using (auth.uid() = user_id);
create policy "progress_insert_own" on public.watch_progress for insert with check (auth.uid() = user_id);

-- 8. SEED DATA — starter subjects, classes and lesson videos
insert into public.subjects (name) values
  ('Mathematics'),('Biology'),('Chemistry'),('Physics'),('English'),('Geography')
on conflict (name) do nothing;

insert into public.classes (name, sort_order) values
  ('Baby',1),('Middle',2),('Top',3),
  ('P1',4),('P2',5),('P3',6),('P4',7),('P5',8),('P6',9),('P7',10),
  ('S1',11),('S2',12),('S3',13),('S4',14),('S5',15),('S6',16)
on conflict (name) do nothing;

insert into public.videos (title, subject, class, topic, duration, views, url, description) values
  ('Algebra Basics for S.5','Mathematics','S5','Algebra','12:45','125K','https://www.youtube.com/embed/NybHckSEQBI','A clear introduction to algebraic expressions, equations and practical problem solving.'),
  ('The Human Circulatory System','Biology','S5','Circulatory System','15:20','98K','https://www.youtube.com/embed/9FX2qzGmY6o','Explore the heart, blood vessels and how circulation supports the human body.'),
  ('Essay Writing Techniques','English','S5','Writing','10:32','76K','https://www.youtube.com/embed/GX0eK4xJwTQ','Build strong essays with planning, paragraphs, evidence and editing techniques.'),
  ('Probability - Introduction','Mathematics','S5','Probability','09:42','54K','https://www.youtube.com/embed/KzfWUEJjG18','Understand sample spaces, events and introductory probability.'),
  ('Trigonometry Fundamentals','Mathematics','S4','Trigonometry','14:18','61K','https://www.youtube.com/embed/Jsiy4TxgIME','Learn sine, cosine and tangent using right-angled triangles.'),
  ('Atomic Structure','Chemistry','S4','Atomic Structure','11:25','48K','https://www.youtube.com/embed/M8YjvHYbZ9w','A foundation lesson on protons, neutrons, electrons and isotopes.'),
  ('Forces and Motion','Physics','S4','Mechanics','13:10','72K','https://www.youtube.com/embed/FOkQszg1-j8','Review forces, motion and the relationships used in basic mechanics.'),
  ('Map Reading Essentials','Geography','S4','Map Work','08:54','39K','https://www.youtube.com/embed/9pillaOxGCo','Read scale, direction, symbols and common map features.')
on conflict do nothing;

-- ============================================================
-- After running this file:
-- 1. Go to Authentication → Users → Add user, create:
--      admin@eduuganda.ug  (choose your own password)
-- 2. Come back to the SQL Editor and run:
--      update public.profiles set is_admin = true
--      where id = (select id from auth.users where email = 'admin@eduuganda.ug');
-- ============================================================
