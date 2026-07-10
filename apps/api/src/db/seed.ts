import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ingestAll } from './ingestGeojson';
import { closePool } from './pool';

/** Seed the database by ingesting the mock GeoJSON datasets. */
export async function seed(): Promise<void> {
  const results = await ingestAll();
  const total = results.reduce((sum, r) => sum + r.inserted + r.updated, 0);
  console.log(`Seed complete: ${total} rows loaded.`);
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  seed()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      void closePool().finally(() => process.exit(1));
    });
}
