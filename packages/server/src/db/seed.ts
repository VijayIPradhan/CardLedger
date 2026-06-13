import { db } from './index.js';
import { holders, users } from './schema.js';
import { eq } from 'drizzle-orm';
import argon2 from 'argon2';

interface Logger {
  info(msg: string): void;
}

const fallbackLogger: Logger = { info: (msg) => console.log(msg) };

export async function seed(logger: Logger = fallbackLogger) {
  let adminUserId: string | undefined;

  const existingUsers = await db.select().from(users);
  if (existingUsers.length === 0) {
    const hash = await argon2.hash(process.env.DEFAULT_PASSWORD ?? 'changeme123');
    const [newUser] = await db
      .insert(users)
      .values({ username: 'admin', password_hash: hash })
      .returning();
    adminUserId = newUser.id;
    logger.info('Seeded admin user');
  } else {
    adminUserId = existingUsers[0].id;
  }

  const existing = await db.select().from(holders).where(eq(holders.relationship, 'me'));
  if (existing.length === 0 && adminUserId) {
    await db.insert(holders).values({
      user_id: adminUserId,
      name: 'Me',
      phone: '0000000000',
      relationship: 'me',
    });
    logger.info('Seeded default "me" holder');
  }
}
