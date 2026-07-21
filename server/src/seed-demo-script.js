import { sourceProperties } from './agents/sourcing.js';
import { insert, all, uuid, initStore } from './store.js';
import { ZONES } from './seed/zones.js';

async function seed() {
  await initStore();
  const existing = await all('properties');
  if (existing.length) {
    console.log('Property DB already has rows — skipped.');
    return;
  }
  const saved = [];
  for (const z of ZONES) {
    console.log('Sourcing for', z.label);
    const { results } = await sourceProperties({ area: z.label });
    for (const r of results) {
      saved.push(await insert('properties', { id: uuid(), ...r, status: 'confirmed', admin_notes: 'demo seed' }));
    }
  }
  console.log('Saved', saved.length, 'properties');
}
seed().catch(console.error);
