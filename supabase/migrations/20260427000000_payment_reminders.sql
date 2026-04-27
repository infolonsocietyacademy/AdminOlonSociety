create extension if not exists pgcrypto;

create table if not exists public.student_subscriptions (
  id uuid primary key default gen_random_uuid(),
  portal_request_id text unique,
  full_name text not null,
  email text not null,
  whatsapp text,
  country text,
  city text,
  plan_name text not null default 'Olon Society Academy',
  amount numeric(10,2),
  currency text not null default 'USD',
  next_payment_date date,
  status text not null default 'active' check (status in ('active','paused','cancelled')),
  reminder_days integer[] not null default array[7,3,1,0],
  last_reminder_sent_for date,
  last_reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_reminder_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.student_subscriptions(id) on delete cascade,
  payment_due_date date not null,
  reminder_day integer not null,
  email_to text not null,
  status text not null check (status in ('sent','failed','skipped')),
  resend_id text,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists student_subscriptions_due_idx
  on public.student_subscriptions (status, next_payment_date);

create index if not exists payment_reminder_events_lookup_idx
  on public.payment_reminder_events (subscription_id, payment_due_date, reminder_day, status);

create unique index if not exists payment_reminder_events_sent_once_idx
  on public.payment_reminder_events (subscription_id, payment_due_date, reminder_day)
  where status = 'sent';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_student_subscriptions_updated_at on public.student_subscriptions;
create trigger set_student_subscriptions_updated_at
before update on public.student_subscriptions
for each row execute function public.set_updated_at();

alter table public.student_subscriptions enable row level security;
alter table public.payment_reminder_events enable row level security;

drop policy if exists "authenticated users can manage student subscriptions" on public.student_subscriptions;
create policy "authenticated users can manage student subscriptions"
on public.student_subscriptions
for all
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated users can read payment reminder events" on public.payment_reminder_events;
create policy "authenticated users can read payment reminder events"
on public.payment_reminder_events
for select
to authenticated
using (true);
