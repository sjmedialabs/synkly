-- Add canonical role column for RBAC (idempotent).
alter table if exists users
add column if not exists role varchar;

-- Backfill role from designation where role is missing.
update users
set role = case
  when lower(coalesce(designation, '')) like '%super admin%' then 'super_admin'
  when lower(coalesce(designation, '')) like '%project manager%' then 'project_manager'
  when lower(coalesce(designation, '')) like '%delivery manager%' then 'delivery_manager'
  when lower(coalesce(designation, '')) like '%team lead%' then 'team_lead'
  when lower(coalesce(designation, '')) = 'senior' then 'senior'
  when lower(coalesce(designation, '')) = 'junior' then 'junior'
  when lower(coalesce(designation, '')) = 'trainee' then 'trainee'
  else role
end
where role is null and designation is not null;

-- Optional sanity defaults requested by product flow.
update users set role = 'super_admin' where lower(email) = 'info@sjmedialabs.com';
update users set role = 'project_manager' where lower(email) = 'sudheer@sjmedialabs.com';

