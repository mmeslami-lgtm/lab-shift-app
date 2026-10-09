-- 14-middle-shift-days-schema.sql  (Dienstplaner Labor: Mitteldienst & Co. auch freitags / samstags / sonntags?)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-13. Safe to run again.
-- Three switches per extra shift (Mitteldienst, Büro, own shifts). Defaults = behaviour before:
-- Monday-Friday yes, Saturday/Sunday no. Holidays stay free of these shifts.
alter table shift_definitions add column if not exists on_friday   boolean not null default true;
alter table shift_definitions add column if not exists on_saturday boolean not null default false;
alter table shift_definitions add column if not exists on_sunday   boolean not null default false;
