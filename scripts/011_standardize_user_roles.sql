-- Backward-compatible RBAC role backfill.
-- Copies role from designation when role is NULL and normalizes common values.

update users
set role = case
  when lower(coalesce(designation, '')) like '%super admin%' then 'super_admin'
  when lower(coalesce(designation, '')) like '%project manager%' then 'project_manager'
  when lower(coalesce(designation, '')) like '%delivery manager%' then 'delivery_manager'
  when lower(coalesce(designation, '')) like '%team lead%' then 'team_lead'
  when lower(coalesce(designation, '')) like 'senior' then 'senior'
  when lower(coalesce(designation, '')) like 'junior' then 'junior'
  when lower(coalesce(designation, '')) like 'trainee' then 'trainee'
  else role
end
where role is null and designation is not null;

-- Normalize existing role values that were saved as labels.
update users
set role = case
  when lower(role) like '%super admin%' then 'super_admin'
  when lower(role) like '%project manager%' then 'project_manager'
  when lower(role) like '%delivery manager%' then 'delivery_manager'
  when lower(role) like '%team lead%' then 'team_lead'
  when lower(role) = 'senior' then 'senior'
  when lower(role) = 'junior' then 'junior'
  when lower(role) = 'trainee' then 'trainee'
  else role
end
where role is not null;

