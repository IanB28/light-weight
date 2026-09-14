import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';

export type IdentityRecord = typeof users.$inferSelect;

export interface CreateIdentityInput {
  email: string;
  username: string;
  displayName: string;
  passwordHash: string;
}

export interface IdentityRepository {
  findByEmail(email: string): Promise<IdentityRecord | undefined>;
  findByUsername(username: string): Promise<IdentityRecord | undefined>;
  create(input: CreateIdentityInput): Promise<IdentityRecord>;
}

export const identityRepository: IdentityRepository = {
  async findByEmail(email) {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user;
  },
  async findByUsername(username) {
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return user;
  },
  async create(input) {
    const [user] = await db.insert(users).values({
      ...input,
      name: input.displayName
    }).returning();
    return user;
  }
};
