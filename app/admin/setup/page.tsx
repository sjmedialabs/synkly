'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function AdminSetupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('master_admin');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  
  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) {
        setLoginError(error.message);
        setLoginLoading(false);
        return;
      }

      if (data.session) {
        window.location.href = '/dashboard';
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
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
        if (data.session) {
          setMessage('User created and logged in! Redirecting...');
          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 1500);
        } else {
          setMessage(`User created! Email: ${email}. Check your inbox for confirmation, or use the Login tab to sign in.`);
        }
        
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

  const fillTestCredentials = (emailVal: string, passwordVal: string) => {
    setLoginEmail(emailVal);
    setLoginPassword(passwordVal);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 p-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-2">Synkly Admin Setup</h1>
          <p className="text-muted-foreground">
            Create an account or login to access the system
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Main Auth Card */}
          <Card className="lg:col-span-1">
            <Tabs defaultValue="login" className="w-full">
              <CardHeader className="pb-2">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login">Login</TabsTrigger>
                  <TabsTrigger value="signup">Sign Up</TabsTrigger>
                </TabsList>
              </CardHeader>
              
              <CardContent className="pt-4">
                <TabsContent value="login" className="mt-0">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Email</label>
                      <Input
                        type="email"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="admin@example.com"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium">Password</label>
                      <Input
                        type="password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="Enter password"
                        required
                      />
                    </div>

                    <Button type="submit" disabled={loginLoading} className="w-full">
                      {loginLoading ? 'Signing in...' : 'Sign In'}
                    </Button>
                  </form>

                  {loginError && (
                    <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                      {loginError}
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="signup" className="mt-0">
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
                        placeholder="Min 8 characters"
                        required
                        minLength={8}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium">Role</label>
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="w-full px-3 py-2 border border-input rounded-md bg-background"
                      >
                        <option value="master_admin">Master Admin</option>
                        <option value="client_admin">Client Admin</option>
                        <option value="manager">Manager</option>
                        <option value="team_lead">Team Lead</option>
                        <option value="member">Member</option>
                      </select>
                    </div>

                    <Button type="submit" disabled={loading} className="w-full">
                      {loading ? 'Creating...' : 'Create Account'}
                    </Button>
                  </form>

                  {error && (
                    <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                      {error}
                    </div>
                  )}

                  {message && (
                    <div className="mt-4 p-3 bg-green-100 text-green-900 rounded-md text-sm">
                      {message}
                    </div>
                  )}
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>

          {/* Quick Login Credentials */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Login</CardTitle>
              <CardDescription>Click to fill credentials, then login</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <button
                type="button"
                onClick={() => fillTestCredentials('master@synkly.com', 'Password123!')}
                className="w-full text-left p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors"
              >
                <p className="font-medium text-sm">Master Admin</p>
                <p className="text-xs text-muted-foreground font-mono">master@synkly.com</p>
              </button>
              
              <button
                type="button"
                onClick={() => fillTestCredentials('admin@acme.com', 'AcmeAdmin123!')}
                className="w-full text-left p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors"
              >
                <p className="font-medium text-sm">Client Admin (Acme)</p>
                <p className="text-xs text-muted-foreground font-mono">admin@acme.com</p>
              </button>
              
              <button
                type="button"
                onClick={() => fillTestCredentials('manager@acme.com', 'Manager123!')}
                className="w-full text-left p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors"
              >
                <p className="font-medium text-sm">Manager (Acme)</p>
                <p className="text-xs text-muted-foreground font-mono">manager@acme.com</p>
              </button>
              
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Note: These accounts need to be created first using the Sign Up tab before you can login.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Getting Started */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm list-decimal list-inside">
              <li>Go to the <strong>Sign Up</strong> tab and create a <strong>Master Admin</strong> account</li>
              <li>After signup, switch to the <strong>Login</strong> tab and sign in with your credentials</li>
              <li>Once logged in, you will be redirected to the dashboard</li>
              <li>Use the Admin panel to manage clients and users</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
