begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(15);

do $$
begin
  for i in 1..799 loop
    perform public.record_whatsapp_channel_status(
      'wamid-custo-' || i::text, 'sent', '2026-10-20 12:00:00+00',
      '{"billable":true,"category":"service"}'::jsonb
    );
  end loop;
end;
$$;

select is((select service_responses from private.whatsapp_monthly_usage where month = '2026-10-01'),
  799, 'respostas de serviço billable entram no mês do timestamp do status');
select is((select count(*)::integer from private.whatsapp_monthly_usage_alerts where month = '2026-10-01'),
  0, 'não alerta antes de 800 respostas');

select public.record_whatsapp_channel_status(
  'wamid-custo-800', 'sent', '2026-10-20 12:00:00+00',
  '{"billable":true,"category":"service"}'::jsonb
);
select is((select service_responses from private.whatsapp_monthly_usage where month = '2026-10-01'),
  800, 'a resposta de serviço 800 entra no contador');
select is((select string_agg(threshold::text, ',' order by threshold) from private.whatsapp_monthly_usage_alerts where month = '2026-10-01'),
  '800', 'o primeiro alerta é registrado ao atingir 800');

select public.record_whatsapp_channel_status(
  'wamid-custo-800', 'delivered', '2026-10-20 12:01:00+00',
  '{"billable":true,"category":"service"}'::jsonb
);
select is((select service_responses from private.whatsapp_monthly_usage where month = '2026-10-01'),
  800, 'atualizações repetidas do mesmo wamid não contam de novo');

do $$
begin
  for i in 801..999 loop
    perform public.record_whatsapp_channel_status(
      'wamid-custo-' || i::text, 'sent', '2026-10-20 12:00:00+00',
      '{"billable":true,"category":"service"}'::jsonb
    );
  end loop;
end;
$$;
select public.record_whatsapp_channel_status(
  'wamid-custo-1000', 'sent', '2026-10-20 12:00:00+00',
  '{"billable":true,"category":"service"}'::jsonb
);
select is((select service_responses from private.whatsapp_monthly_usage where month = '2026-10-01'),
  1000, 'o Canal registra a resposta de serviço 1.000 sem bloqueá-la');
select is((select string_agg(threshold::text, ',' order by threshold) from private.whatsapp_monthly_usage_alerts where month = '2026-10-01'),
  '800,1000', 'um segundo alerta é registrado ao atingir 1.000');

select public.record_whatsapp_channel_status(
  'wamid-custo-1001', 'sent', '2026-10-20 12:00:00+00',
  '{"billable":true,"category":"service"}'::jsonb
);
select is((select service_responses from private.whatsapp_monthly_usage where month = '2026-10-01'),
  1001, 'o Canal continua enviando depois de 1.000');
select public.record_whatsapp_channel_status(
  'wamid-template', 'sent', '2026-10-20 12:00:00+00',
  '{"billable":true,"category":"utility"}'::jsonb
);
select public.record_whatsapp_channel_status(
  'wamid-nao-billable', 'sent', '2026-10-20 12:00:00+00',
  '{"billable":false,"category":"service"}'::jsonb
);
select is((select templates from private.whatsapp_monthly_usage where month = '2026-10-01'),
  1, 'templates billable são contabilizados separadamente de serviço');
select is((select count(*)::integer from private.credit_entries), 0,
  'o contador de custo não cria Créditos');

do $$
begin
  for i in 1..399 loop
    perform public.record_whatsapp_channel_status(
      'wamid-novembro-service-' || i::text, 'sent', '2026-11-20 12:00:00+00',
      '{"billable":true,"category":"service"}'::jsonb
    );
  end loop;
  for i in 1..400 loop
    perform public.record_whatsapp_channel_status(
      'wamid-template-' || i::text, 'sent', '2026-11-20 12:00:00+00',
      '{"billable":true,"category":"utility"}'::jsonb
    );
  end loop;
end;
$$;
select is((select count(*)::integer from private.whatsapp_monthly_usage_alerts where month = '2026-11-01'),
  0, 'o total combinado abaixo de 800 ainda não gera alerta');
select public.record_whatsapp_channel_status(
  'wamid-novembro-service-400', 'sent', '2026-11-20 12:00:00+00',
  '{"billable":true,"category":"service"}'::jsonb
);
select is((select string_agg(threshold::text, ',' order by threshold) from private.whatsapp_monthly_usage_alerts where month = '2026-11-01'),
  '800', 'respostas e templates juntos disparam o alerta na contagem 800');
do $$
begin
  for i in 401..599 loop
    perform public.record_whatsapp_channel_status(
      'wamid-novembro-service-' || i::text, 'sent', '2026-11-20 12:00:00+00',
      '{"billable":true,"category":"service"}'::jsonb
    );
  end loop;
end;
$$;
select public.record_whatsapp_channel_status(
  'wamid-template-401', 'sent', '2026-11-20 12:00:00+00',
  '{"billable":true,"category":"utility"}'::jsonb
);
select is((select string_agg(threshold::text, ',' order by threshold) from private.whatsapp_monthly_usage_alerts where month = '2026-11-01'),
  '800,1000', 'o total combinado gera o segundo alerta em 1.000');
select is((select service_responses from private.whatsapp_monthly_usage where month = '2026-11-01'),
  599, 'respostas de serviço ficam registradas separadamente');
select is((select templates from private.whatsapp_monthly_usage where month = '2026-11-01'),
  401, 'templates ficam registrados separadamente das respostas de serviço');

select * from finish();
rollback;
