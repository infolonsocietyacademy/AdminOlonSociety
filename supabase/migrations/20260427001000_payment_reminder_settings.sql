create table if not exists public.payment_reminder_settings (
  id boolean primary key default true check (id),
  daily_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

insert into public.payment_reminder_settings (id, daily_enabled)
values (true, true)
on conflict (id) do nothing;

drop trigger if exists set_payment_reminder_settings_updated_at on public.payment_reminder_settings;
create trigger set_payment_reminder_settings_updated_at
before update on public.payment_reminder_settings
for each row execute function public.set_updated_at();

alter table public.payment_reminder_settings enable row level security;

drop policy if exists "authenticated users can manage payment reminder settings" on public.payment_reminder_settings;
create policy "authenticated users can manage payment reminder settings"
on public.payment_reminder_settings
for all
to authenticated
using (true)
with check (true);
