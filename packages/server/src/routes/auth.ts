import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { users, holders } from '../db/schema.js';
import { eq, or } from 'drizzle-orm';
import argon2 from 'argon2';
import { LoginSchema, GoogleLoginSchema } from '@cardledger/shared';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';

const RegisterSchema = z.object({
  username: z.string().min(1).max(100),
  email: z.string().email().optional(),
  password: z.string().min(6),
});

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { username, password } = parsed.data;
    // Match user by exact username OR by email address
    const [user] = await db
      .select()
      .from(users)
      .where(or(eq(users.username, username), eq(users.email, username)));

    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    if (!user.password_hash) {
      return reply.status(401).send({ error: 'Please login with Google' });
    }

    const valid = await argon2.verify(user.password_hash, password);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const token = app.jwt.sign({ sub: user.id, username: user.username }, { expiresIn: '30d' });
    return reply.send({ token });
  });

  app.post('/auth/register', async (request, reply) => {
    const parsed = RegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { username, email, password } = parsed.data;
    const hash = await argon2.hash(password);

    // Check if user already exists by username or email
    const [existing] = await db
      .select()
      .from(users)
      .where(
        or(
          eq(users.username, username),
          email ? eq(users.email, email) : eq(users.username, username),
        ),
      );

    if (existing) {
      // If existing user has no password_hash (logged in via Google previously), allow linking password now!
      if (!existing.password_hash) {
        const [updated] = await db
          .update(users)
          .set({ password_hash: hash, email: existing.email || email })
          .where(eq(users.id, existing.id))
          .returning();
        const token = app.jwt.sign(
          { sub: updated.id, username: updated.username },
          { expiresIn: '30d' },
        );
        return reply.send({ token });
      }
      return reply.status(409).send({ error: 'Username or email already exists' });
    }

    const [newUser] = await db
      .insert(users)
      .values({ username, email, password_hash: hash })
      .returning();

    // Seed default "me" holder
    await db.insert(holders).values({
      user_id: newUser.id,
      name: 'Me',
      phone: '0000000000',
      relationship: 'me',
    });

    const token = app.jwt.sign(
      { sub: newUser.id, username: newUser.username },
      { expiresIn: '30d' },
    );
    return reply.send({ token });
  });

  app.post('/auth/link-password', async (request, reply) => {
    const parsed = RegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { username, email, password } = parsed.data;
    const [existing] = await db
      .select()
      .from(users)
      .where(
        or(
          eq(users.username, username),
          email ? eq(users.email, email) : eq(users.username, username),
        ),
      );

    if (!existing) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const hash = await argon2.hash(password);
    const [updated] = await db
      .update(users)
      .set({ password_hash: hash, email: existing.email || email })
      .where(eq(users.id, existing.id))
      .returning();

    const token = app.jwt.sign(
      { sub: updated.id, username: updated.username },
      { expiresIn: '30d' },
    );
    return reply.send({ token });
  });

  app.post('/auth/google', async (request, reply) => {
    const parsed = GoogleLoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { idToken } = parsed.data;

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload) {
        return reply.status(401).send({ error: 'Invalid Google token' });
      }

      const { sub: googleId, email } = payload;

      // Look up by google_id first, fall back to email — no undefined passed to or()
      let [user] = await db
        .select()
        .from(users)
        .where(
          email
            ? or(eq(users.google_id, googleId), eq(users.email, email))
            : eq(users.google_id, googleId),
        );

      if (!user) {
        // Derive a base username from the email prefix or a googleId slice.
        // Append the googleId suffix to make it collision-proof without a retry loop.
        const base = email ? email.split('@')[0] : 'user';
        const uniqueUsername = `${base}_${googleId.substring(0, 8)}`;

        const [newUser] = await db
          .insert(users)
          .values({ username: uniqueUsername, email, google_id: googleId })
          .returning();
        user = newUser;
      } else if (!user.google_id) {
        await db.update(users).set({ google_id: googleId }).where(eq(users.id, user.id));
      }

      const token = app.jwt.sign({ sub: user.id, username: user.username }, { expiresIn: '30d' });
      return reply.send({ token });
    } catch (e) {
      app.log.error(e);
      return reply.status(401).send({ error: 'Google verification failed' });
    }
  });
}
