#!/usr/bin/env node
// Usage: pnpm session:report mineboss-session.json
require('../tests/register.cjs');
const fs = require('node:fs');
const { parseSession } = require('../src/core/SessionLog.ts');
const { reviewSession, formatReview } = require('../src/core/sessionReview.ts');

const file = process.argv[2];
if (!file) {
  console.error('Usage: pnpm session:report <mineboss-session.json>');
  process.exit(1);
}
const data = parseSession(fs.readFileSync(file, 'utf8'));
if (!data) {
  console.error(`${file} is not a MineBoss session export.`);
  process.exit(1);
}
console.log(formatReview(reviewSession(data)));
