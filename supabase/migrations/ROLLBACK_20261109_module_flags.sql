-- Rollback for 20261109_module_flags.sql. Apply only when reverting this phase.
alter table public.businesses drop column if exists modules_enabled;
