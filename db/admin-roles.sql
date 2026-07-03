-- Promote trusted staff accounts after importing or connecting production data.
-- Replace the values in the `admin_accounts` CTE before running this file.
-- The account IDs should match ADMIN_ACCOUNT_IDS and MODERATOR_ACCOUNT_IDS in your hosting environment.

begin;

with admin_accounts(provider_user_id) as (
  values
    ('discord:replace-with-your-discord-user-id')
)
insert into profiles (provider, provider_user_id, display_name, role, status)
select 'local', provider_user_id, provider_user_id, 'admin', 'active'
from admin_accounts
on conflict (provider, provider_user_id) do update set
  role = 'admin',
  status = 'active',
  updated_at = now();

with moderator_accounts(provider_user_id) as (
  values
    ('discord:replace-with-moderator-discord-user-id')
)
insert into profiles (provider, provider_user_id, display_name, role, status)
select 'local', provider_user_id, provider_user_id, 'moderator', 'active'
from moderator_accounts
on conflict (provider, provider_user_id) do update set
  role = case when profiles.role = 'admin' then 'admin' else 'moderator' end,
  status = 'active',
  updated_at = now();

commit;
