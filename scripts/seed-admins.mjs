#!/usr/bin/env node

import fetch from 'node-fetch';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const testUsers = [
  {
    email: 'master@synkly.com',
    password: 'password123',
    full_name: 'Master Admin',
    role: 'master_admin',
  },
  {
    email: 'admin@acme.com',
    password: 'acme123pass',
    full_name: 'Acme Admin',
    role: 'client_admin',
    client: 'Acme Corporation',
  },
  {
    email: 'manager@acme.com',
    password: 'manager123',
    full_name: 'Acme Manager',
    role: 'manager',
    client: 'Acme Corporation',
  },
];

async function signUpUser(user) {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
        options: {
          data: {
            full_name: user.full_name,
            role: user.role,
          },
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      if (data.code === 'user_already_exists') {
        console.log(`✓ User already exists: ${user.email}`);
        return;
      }
      throw new Error(data.message || 'Unknown error');
    }

    console.log(`✓ Created user: ${user.email}`);
    console.log(`  Full Name: ${user.full_name}`);
    console.log(`  Role: ${user.role}`);
    if (user.client) {
      console.log(`  Client: ${user.client}`);
    }
    console.log();
  } catch (error) {
    console.error(`✗ Error creating ${user.email}:`, error.message);
  }
}

async function main() {
  console.log('Seeding test admin users...\n');

  for (const user of testUsers) {
    await signUpUser(user);
  }

  console.log('\n📋 Test Credentials Summary:');
  console.log('━'.repeat(50));
  testUsers.forEach((user) => {
    console.log(`\nEmail: ${user.email}`);
    console.log(`Password: ${user.password}`);
    console.log(`Role: ${user.role}`);
    if (user.client) console.log(`Client: ${user.client}`);
  });
  console.log('\n✓ Setup complete!\n');
}

main().catch(console.error);
