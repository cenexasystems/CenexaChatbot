-- Store outbound WhatsApp delivery progress reported by Meta.
-- Additive and safe to run before deploying code that consumes these columns.
alter table messages
  add column if not exists delivery_status text
    constraint messages_delivery_status_check
      check (delivery_status in ('sent', 'delivered', 'read', 'failed')),
  add column if not exists delivery_error_code text;
