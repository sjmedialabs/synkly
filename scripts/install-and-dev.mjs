#!/usr/bin/env node
import { execSync } from 'child_process';

console.log('Installing dependencies with pnpm...');
execSync('pnpm install', { stdio: 'inherit' });

console.log('Starting development server...');
execSync('pnpm dev', { stdio: 'inherit' });
