create table private.whatsapp_monthly_usage_alerts (
  month date not null,
  threshold integer not null check (threshold in (800, 1000)),
  created_at timestamptz not null default now(),
  primary key (month, threshold)
);
alter table private.whatsapp_monthly_usage_alerts enable row level security;
revoke all on private.whatsapp_monthly_usage_alerts from public, anon, authenticated, service_role;

drop function public.record_whatsapp_channel_status(text, text, timestamptz, jsonb);
create function public.record_whatsapp_channel_status(p_message_id text, p_status text, p_updated_at timestamptz, p_pricing jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_counted boolean;
  v_month date := date_trunc('month', p_updated_at at time zone 'UTC')::date;
  v_service_responses integer;
  v_templates integer;
  v_total integer;
  v_alert integer;
begin
  insert into private.whatsapp_message_statuses(message_id, status, updated_at, pricing)
  values (p_message_id, p_status, p_updated_at, p_pricing)
  on conflict (message_id) do update set status = excluded.status, updated_at = excluded.updated_at,
    pricing = coalesce(excluded.pricing, private.whatsapp_message_statuses.pricing);

  if coalesce(p_pricing ->> 'billable', 'false') = 'true'
    and p_pricing ->> 'category' in ('service', 'authentication', 'utility', 'marketing') then
    update private.whatsapp_message_statuses set counted_at = now()
    where message_id = p_message_id and counted_at is null returning true into v_counted;
    if coalesce(v_counted, false) then
      insert into private.whatsapp_monthly_usage(month, service_responses, templates)
      values (v_month,
        case when p_pricing ->> 'category' = 'service' then 1 else 0 end,
        case when p_pricing ->> 'category' in ('authentication', 'utility', 'marketing') then 1 else 0 end)
      on conflict (month) do update set
        service_responses = private.whatsapp_monthly_usage.service_responses + excluded.service_responses,
        templates = private.whatsapp_monthly_usage.templates + excluded.templates,
        updated_at = now()
      returning service_responses into v_service_responses;

      select templates into v_templates from private.whatsapp_monthly_usage where month = v_month;
      v_total := v_service_responses + v_templates;
      if v_total in (800, 1000) then
        insert into private.whatsapp_monthly_usage_alerts(month, threshold)
        values (v_month, v_total)
        on conflict (month, threshold) do nothing
        returning threshold into v_alert;
      end if;
    end if;
  end if;

  if v_alert is null then return null; end if;
  return v_alert;
end;
$$;

revoke all on function public.record_whatsapp_channel_status(text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.record_whatsapp_channel_status(text, text, timestamptz, jsonb) to service_role;
