select cron.schedule(
  'sync-pif-payments',
  '7 * * * *',
  $$
  select net.http_post(
    url := 'https://project--77a6d453-2ccb-4bdc-b7a5-7900dd491db2.lovable.app/api/public/hooks/sync-pif-payments',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);