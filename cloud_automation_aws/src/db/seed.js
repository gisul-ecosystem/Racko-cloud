import 'dotenv/config';

import connectDB from '../config/db.js';
import { ensureDefaultCatalog } from '../services/catalogSeedService.js';

const seed = async () => {
  await connectDB();
  const result = await ensureDefaultCatalog();
  console.log(
    result.seeded
      ? `Seed complete — ${result.categories} categories, ${result.services} services`
      : `Catalog already populated — ${result.categories} categories, ${result.services} services`
  );
  process.exit(0);
};

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
