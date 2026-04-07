#!/bin/bash
set -e

echo "Installing dependencies with pnpm..."
pnpm install

echo "Starting development server..."
pnpm dev
