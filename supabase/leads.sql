-- Таблица заявок для сайта Luxali Escape.
-- Выполнить один раз в Supabase: SQL Editor → New query → вставить → Run.
-- Скрипт можно запускать повторно: он ничего не удаляет из уже сохранённых заявок.

create table if not exists public.leads (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  status      text not null default 'новая'
              check (status in ('новая', 'в работе', 'закрыта')),
  name        text not null check (char_length(btrim(name)) between 2 and 80),
  phone       text not null check (
                phone ~ '^\+?[0-9 ()\-.]+$'
                and char_length(regexp_replace(phone, '\D', '', 'g')) between 8 and 15
              ),
  comment     text not null check (char_length(btrim(comment)) between 3 and 2000),
  choices     text check (choices is null or char_length(choices) <= 4000),
  lang        text check (lang is null or lang in ('ru', 'en'))
);

comment on table public.leads is 'Заявки с формы на сайте мудборда';
comment on column public.leads.choices is 'Что клиент выбрал в тесте (итог мудборда)';

create index if not exists leads_status_created_idx on public.leads (status, created_at desc);

-- Доступ: заявки пишет только сервер сайта (Vercel) секретным ключом.
-- Публичный ключ не может ни читать, ни добавлять заявки.
-- Смотреть и менять статус — в панели Supabase: Table Editor → leads.
alter table public.leads enable row level security;
drop policy if exists "site can insert new leads" on public.leads;
revoke all on public.leads from anon, authenticated;
-- Серверу сайта нужен доступ на запись (и чтение, чтобы вернуть номер и время заявки).
grant select, insert on public.leads to service_role;
