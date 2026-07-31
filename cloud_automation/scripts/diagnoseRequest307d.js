#!/usr/bin/env node
require('dotenv').config();
const db = require('../src/db/postgres');

(async () => {
  for (const id of [306, 308]) {
    const svc = await db.query(`SELECT * FROM request_services WHERE request_id = $1`, [id]);
    const inst = await db.query(`SELECT * FROM request_service_instances WHERE request_id = $1`, [id]);
    const roles = await db.query(`SELECT * FROM request_service_roles WHERE request_id = $1`, [id]);
    console.log(`\n#${id} services=${svc.rows.length} instances=${inst.rows.length} roles=${roles.rows.length}`);
    if (roles.rows.length) console.log(' roles sample:', roles.rows.slice(0, 3));
  }
  await db.end();
})().catch(async (e) => { console.error(e); try { await db.end(); } catch {} process.exit(1); });
