-- Task Management System Database Schema - Part 2
-- Enable Row Level Security and create RLS policies

-- Enable Row Level Security
ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS roles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for roles (everyone can read)
DROP POLICY IF EXISTS roles_select_all ON roles;
CREATE POLICY roles_select_all ON roles FOR SELECT USING (true);

-- RLS Policies for users
DROP POLICY IF EXISTS users_select_all ON users;
CREATE POLICY users_select_all ON users FOR SELECT USING (true);

DROP POLICY IF EXISTS users_insert_own ON users;
CREATE POLICY users_insert_own ON users FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS users_update_own ON users;
CREATE POLICY users_update_own ON users FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for clients (authenticated users can view, manage)
DROP POLICY IF EXISTS clients_select_authenticated ON clients;
CREATE POLICY clients_select_authenticated ON clients FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS clients_insert_authenticated ON clients;
CREATE POLICY clients_insert_authenticated ON clients FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS clients_update_authenticated ON clients;
CREATE POLICY clients_update_authenticated ON clients FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS clients_delete_authenticated ON clients;
CREATE POLICY clients_delete_authenticated ON clients FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS Policies for projects
DROP POLICY IF EXISTS projects_select_authenticated ON projects;
CREATE POLICY projects_select_authenticated ON projects FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS projects_insert_authenticated ON projects;
CREATE POLICY projects_insert_authenticated ON projects FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS projects_update_authenticated ON projects;
CREATE POLICY projects_update_authenticated ON projects FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS projects_delete_authenticated ON projects;
CREATE POLICY projects_delete_authenticated ON projects FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS Policies for project_users
DROP POLICY IF EXISTS project_users_select_authenticated ON project_users;
CREATE POLICY project_users_select_authenticated ON project_users FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS project_users_insert_authenticated ON project_users;
CREATE POLICY project_users_insert_authenticated ON project_users FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS project_users_update_authenticated ON project_users;
CREATE POLICY project_users_update_authenticated ON project_users FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS project_users_delete_authenticated ON project_users;
CREATE POLICY project_users_delete_authenticated ON project_users FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS Policies for modules
DROP POLICY IF EXISTS modules_select_authenticated ON modules;
CREATE POLICY modules_select_authenticated ON modules FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS modules_insert_authenticated ON modules;
CREATE POLICY modules_insert_authenticated ON modules FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS modules_update_authenticated ON modules;
CREATE POLICY modules_update_authenticated ON modules FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS modules_delete_authenticated ON modules;
CREATE POLICY modules_delete_authenticated ON modules FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS Policies for tasks
DROP POLICY IF EXISTS tasks_select_authenticated ON tasks;
CREATE POLICY tasks_select_authenticated ON tasks FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS tasks_insert_authenticated ON tasks;
CREATE POLICY tasks_insert_authenticated ON tasks FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS tasks_update_authenticated ON tasks;
CREATE POLICY tasks_update_authenticated ON tasks FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS tasks_delete_authenticated ON tasks;
CREATE POLICY tasks_delete_authenticated ON tasks FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS Policies for subtasks
DROP POLICY IF EXISTS subtasks_select_authenticated ON subtasks;
CREATE POLICY subtasks_select_authenticated ON subtasks FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS subtasks_insert_authenticated ON subtasks;
CREATE POLICY subtasks_insert_authenticated ON subtasks FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS subtasks_update_authenticated ON subtasks;
CREATE POLICY subtasks_update_authenticated ON subtasks FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS subtasks_delete_authenticated ON subtasks;
CREATE POLICY subtasks_delete_authenticated ON subtasks FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS Policies for documents
DROP POLICY IF EXISTS documents_select_authenticated ON documents;
CREATE POLICY documents_select_authenticated ON documents FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS documents_insert_authenticated ON documents;
CREATE POLICY documents_insert_authenticated ON documents FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS documents_delete_authenticated ON documents;
CREATE POLICY documents_delete_authenticated ON documents FOR DELETE USING (auth.uid() IS NOT NULL);

-- RLS Policies for comments
DROP POLICY IF EXISTS comments_select_authenticated ON comments;
CREATE POLICY comments_select_authenticated ON comments FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS comments_insert_own ON comments;
CREATE POLICY comments_insert_own ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS comments_update_own ON comments;
CREATE POLICY comments_update_own ON comments FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS comments_delete_own ON comments;
CREATE POLICY comments_delete_own ON comments FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for activity_logs
DROP POLICY IF EXISTS activity_logs_select_authenticated ON activity_logs;
CREATE POLICY activity_logs_select_authenticated ON activity_logs FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS activity_logs_insert_authenticated ON activity_logs;
CREATE POLICY activity_logs_insert_authenticated ON activity_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- RLS Policies for notifications
DROP POLICY IF EXISTS notifications_select_own ON notifications;
CREATE POLICY notifications_select_own ON notifications FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notifications_insert_authenticated ON notifications;
CREATE POLICY notifications_insert_authenticated ON notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS notifications_update_own ON notifications;
CREATE POLICY notifications_update_own ON notifications FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notifications_delete_own ON notifications;
CREATE POLICY notifications_delete_own ON notifications FOR DELETE USING (auth.uid() = user_id);
