import 'dotenv/config';
import { buildApp } from './app.js';
import { seed } from './db/seed.js';

const app = await buildApp();
await seed();
await app.listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' });
console.log(`Server listening on port ${process.env.PORT ?? 3001}`);
