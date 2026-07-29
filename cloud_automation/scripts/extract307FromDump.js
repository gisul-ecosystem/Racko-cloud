#!/usr/bin/env node
/**
 * Extract request #307 related rows from supabase.dump (if present).
 */
const fs = require('fs');
const path = require('path');

const DUMP = path.join(__dirname, '..', 'supabase.dump');
const REQUEST_ID = 307;

const TABLES = [
  'requests',
  'azure_users',
  'user_usage_sessions',
  'lab_history_snapshots',
  'resource_cleanup_logs',
  'daily_usage_tracking',
  'user_budget_spend',
  'request_service_instances',
  'request_service_roles',
  'request_services',
  'request_user_resource_groups',
];

function extractCopyBlock(table) {
  const content = fs.readFileSync(DUMP);
  const text = content.toString('latin1');
  const marker = `COPY public.${table} `;
  const start = text.indexOf(marker);
  if (start < 0) {
    return { table, found: false, rows: [] };
  }

  const dataStart = text.indexOf('\n', start) + 1;
  const endMarker = '\n\\.\n';
  const end = text.indexOf(endMarker, dataStart);
  if (end < 0) {
    return { table, found: true, rows: [], error: 'no terminator' };
  }

  const block = text.slice(dataStart, end);
  const lines = block.split('\n').filter(Boolean);
  const matched = lines.filter((line) => {
    if (table === 'requests') {
      return line.startsWith(`${REQUEST_ID}\t`);
    }
    if (table === 'azure_users') {
      return line.includes('\tcust-307-') || line.includes(`\t${REQUEST_ID}\t`);
    }
    const parts = line.split('\t');
    if (table === 'user_usage_sessions' || table === 'lab_history_snapshots' || table === 'resource_cleanup_logs' || table === 'daily_usage_tracking') {
      // request_id column position varies — also match cust-307 in line
      return line.includes(`\t${REQUEST_ID}\t`) || line.includes('cust-307-');
    }
    return line.includes(`\t${REQUEST_ID}\t`) || line.includes('RG-CUST-307-') || line.includes('cust-307-');
  });

  return { table, found: true, totalLines: lines.length, matched: matched.length, sample: matched.slice(0, 3) };
}

for (const table of TABLES) {
  const result = extractCopyBlock(table);
  console.log(JSON.stringify(result));
}
