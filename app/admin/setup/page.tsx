'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function AdminSetupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('master_admin');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const supabase = createClient();

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      // Sign up the user
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: role,
          },
        },
      });

      if (signUpError) {
        setError(`Error creating user: ${signUpError.message}`);
        setLoading(false);
        return;
      }

      if (data.user) {
        setMessage(`
          ✓ Admin user created successfully!
          
          Email: ${email}
          Password: ${password}
          Role: ${role}
          User ID: ${data.user.id}
          
          Note: User needs to confirm email before logging in.
        `);
        
        // Reset form
        setEmail('');
        setPassword('');
        setFullName('');
      }
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Admin Setup</h1>
          <p className="text-muted-foreground">
            Create master admin and client admin users for the system
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Test Credentials */}
          <Card>
            <CardHeader>
              <CardTitle>Test Credentials</CardTitle>
              <CardDescription>Use these to test the system</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-secondary/50 p-4 rounded-lg space-y-2 text-sm font-mono">
                <div>
                  <p className="text-muted-foreground">Master Admin:</p>
                  <p>master@synkly.com</p>
                  <p>password123</p>
                </div>
                <div className="border-t border-border pt-2 mt-2">
                  <p className="text-muted-foreground">Client Admin (Acme):</p>
                  <p>admin@acme.com</p>
                  <p>acme123pass</p>
                </div>
                <div className="border-t border-border pt-2 mt-2">
                  <p className="text-muted-foreground">Team Manager (Acme):</p>
                  <p>manager@acme.com</p>
                  <p>manager123</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Create Admin Form */}
          <Card>
            <CardHeader>
              <CardTitle>Create New Admin</CardTitle>
              <CardDescription>Add a new administrator user</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateAdmin} className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Full Name</label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Doe"
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@example.com"
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Password</label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-md"
                  >
                    <option value="master_admin">Master Admin</option>
                    <option value="client_admin">Client Admin</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>

                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? 'Creating...' : 'Create Admin'}
                </Button>
              </form>

              {error && (
                <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                  {error}
                </div>
              )}

              {message && (
                <div className="mt-4 p-3 bg-green-50 text-green-900 rounded-md text-sm whitespace-pre-wrap">
                  {message}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Test Clients Info */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Test Clients</CardTitle>
            <CardDescription>Organizations created in the system</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="bg-secondary/50 p-4 rounded-lg">
                <p className="font-semibold">Acme Corporation</p>
                <p className="text-sm text-muted-foreground">admin@acme.com</p>
                <p className="text-xs text-muted-foreground mt-2">3 Projects • Sample data included</p>
              </div>
              <div className="bg-secondary/50 p-4 rounded-lg">
                <p className="font-semibold">Tech Innovations Inc</p>
                <p className="text-sm text-muted-foreground">contact@techinno.com</p>
                <p className="text-xs text-muted-foreground mt-2">1 Project • Ready for setup</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Start Guide */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Quick Start Guide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="font-semibold mb-1">1. Create Master Admin User</p>
              <p className="text-muted-foreground">Use the form on the right to create a master admin with email master@synkly.com</p>
            </div>
            <div>
              <p className="font-semibold mb-1">2. Login as Master Admin</p>
              <p className="text-muted-foreground">Go to login page and sign in with master admin credentials</p>
            </div>
            <div>
              <p className="font-semibold mb-1">3. Access Admin Dashboard</p>
              <p className="text-muted-foreground">Navigate to /admin to manage clients and system configuration</p>
            </div>
            <div>
              <p className="font-semibold mb-1">4. Create Client Admins</p>
              <p className="text-muted-foreground">From admin dashboard, select a client and assign admin users</p>
            </div>
            <div>
              <p className="font-semibold mb-1">5. Team Members Signup</p>
              <p className="text-muted-foreground">Team members can signup directly and be added to projects by managers</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
