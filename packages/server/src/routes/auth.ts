import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq, or } from 'drizzle-orm';
import argon2 from 'argon2';
import { LoginSchema, GoogleLoginSchema } from '@cardledger/shared';
import { OAuth2Client } from 'google-auth-library';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { username, password } = parsed.data;
    const [user] = await db.select().from(users).where(eq(users.username, username));
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

    const token = app.jwt.sign({ sub: user.id, username: user.username }, { expiresIn: '24h' });
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

      const token = app.jwt.sign({ sub: user.id, username: user.username }, { expiresIn: '24h' });
      return reply.send({ token });
    } catch (e) {
      app.log.error(e);
      return reply.status(401).send({ error: 'Google verification failed' });
    }
  });
}
