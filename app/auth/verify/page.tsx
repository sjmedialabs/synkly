'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSearchParams } from 'next/navigation';

export default function VerifyPage() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const searchParams = useSearchParams();
  
  const supabase = createClient();

  // Check if code is in URL params (from localhost redirect)
  useEffect(() => {
    const codeParam = searchParams.get('code');
    if (codeParam) {
      setCode(codeParam);
      // Auto-verify if code is present
      handleVerify(codeParam);
    }
  }, [searchParams]);

  const handleVerify = async (verifyCode?: string) => {
    const codeToUse = verifyCode || code;
    if (!codeToUse) {
      setError('Please enter a verification code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(codeToUse);

      if (exchangeError) {
        setError(exchangeError.message);
        setLoading(false);
        return;
      }

      if (data.session) {
        setSuccess('Email verified successfully! Redirecting to dashboard...');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Verify Your Email</CardTitle>
          <CardDescription>
            Enter the verification code from your email confirmation link
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-amber-100 dark:bg-amber-900/30 p-4 rounded-lg text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-200 mb-2">
              Getting localhost redirect error?
            </p>
            <ol className="list-decimal list-inside text-amber-700 dark:text-amber-300 space-y-1 text-xs">
              <li>Copy the <code className="bg-amber-200 dark:bg-amber-800 px-1 rounded">code</code> parameter from the localhost URL</li>
              <li>Example: localhost:3000/?code=<strong>abc123...</strong></li>
              <li>Paste the code below and click Verify</li>
            </ol>
          </div>

          <div>
            <label className="text-sm font-medium">Verification Code</label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Paste the code from your email link"
              className="font-mono text-sm"
            />
          </div>

          <Button 
            onClick={() => handleVerify()} 
            disabled={loading || !code}
            className="w-full"
          >
            {loading ? 'Verifying...' : 'Verify Email'}
          </Button>

          {error && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-100 text-green-900 rounded-md text-sm">
              {success}
            </div>
          )}

          <div className="pt-4 border-t text-center">
            <a href="/auth/login" className="text-sm text-primary hover:underline">
              Back to Login
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
