#!/usr/bin/env node
import 'dotenv/config';
import React from 'react';
import { withFullScreen } from 'fullscreen-ink';
import { App } from './app/App.js';

async function main() {
  const ink = withFullScreen(<App />);
  await ink.start();
  await ink.waitUntilExit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
