import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { authIdentities, users } from '../db/schema.js';

export type IdentityRecord = typeof users.$inferSelect;

export interface CreateIdentityInput {
  email: string;
  username: string;
  displayName: string;
  passwordHash: string;
}

export interface CreateFederatedIdentityInput {
  email: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface IdentityRepository {
  findByEmail(email: string): Promise<IdentityRecord | undefined>;
  findByUsername(username: string): Promise<IdentityRecord | undefined>;
  create(input: CreateIdentityInput): Promise<IdentityRecord>;
  findIdentity(provider: string, providerSubject: string): Promise<IdentityRecord | undefined>;
  createWithIdentity(
    input: CreateFederatedIdentityInput,
    provider: string,
    providerSubject: string
  ): Promise<IdentityRecord>;
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
  },
  async findIdentity(provider, providerSubject) {
    const [record] = await db.select({ user: users })
      .from(authIdentities)
      .innerJoin(users, eq(users.id, authIdentities.userId))
      .where(and(eq(authIdentities.provider, provider), eq(authIdentities.providerSubject, providerSubject)))
      .limit(1);
    return record?.user;
  },
  async createWithIdentity(input, provider, providerSubject) {
    return await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({
        email: input.email,
        displayName: input.displayName,
        name: input.displayName,
        avatarUrl: input.avatarUrl ?? null,
        username: null,
        passwordHash: null
      }).returning();
      await tx.insert(authIdentities).values({
        userId: user.id,
        provider,
        providerSubject
      });
      return user;
    });
  }
};
