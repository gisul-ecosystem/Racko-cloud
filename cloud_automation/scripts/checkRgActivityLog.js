#!/usr/bin/env node
require('dotenv').config();

const { MonitorClient } = require('@azure/arm-monitor');
const { createAzureCredential, validateAzureEnv } = require('../src/config/azure');

const rg = process.argv[2] || 'RG-CUST-313-U6';
const since = process.argv[3] || '2026-07-27T00:00:00Z';

(async () => {
  const cfg = validateAzureEnv();
  const monitor = new MonitorClient(createAzureCredential(cfg), cfg.subscriptionId);
  const filter = `eventTimestamp ge '${since}' and resourceGroupName eq '${rg}'`;
  const events = [];

  for await (const event of monitor.activityLogs.list(filter)) {
    events.push({
      time: event.eventTimestamp,
      op: event.operationName?.value || event.operationName?.localizedValue,
      caller: event.claims?.upn || event.claims?.email || event.caller,
      status: event.status?.value,
      resource: event.resourceId?.split('/').slice(-2).join('/')
    });
  }

  console.log(`Activity log for ${rg} since ${since}: ${events.length} event(s)`);
  console.log(JSON.stringify(events.slice(0, 30), null, 2));
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
