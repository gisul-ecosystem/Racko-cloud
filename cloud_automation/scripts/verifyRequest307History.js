#!/usr/bin/env node
require('dotenv').config();
const { getLabHistoryForRequest } = require('../src/services/labHistoryService');
const db = require('../src/db/postgres');

(async () => {
  const history = await getLabHistoryForRequest(307, { limit: 50 });
  console.log('userSummaries:', history.userSummaries.length);
  console.log('sessions:', history.sessions.length);
  console.log('timeline:', history.timeline.length);
  console.log('sample user:', history.userSummaries[0]);
  console.log('total MTD:', history.userSummaries.reduce((s, u) => s + u.azureCostMtdUsd, 0));
  await db.end();
})();
