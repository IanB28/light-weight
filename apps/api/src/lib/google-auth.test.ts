import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from './api-error.js';
import { authenticateWithGoogle, type GoogleAuthProfile } from './auth-service.js';
import { verifyGoogleCredential } from './google-auth.js';
import type { CreateFederatedIdentityInput, CreateIdentityInput, IdentityRecord, IdentityRepository } from './identity-repository.js';
import { toAuthUser } from './auth-session.js';

interface FederatedIdentityRecord {
  userId: string;
  provider: string;
  providerSubject: string;
}

function mockIdentity(overrides: Partial<IdentityRecord> = {}): IdentityRecord {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: '10000000-0000-4000-8000-000000000001',
    email: 'user@example.com',
    username: 'existing_user',
    passwordHash: 'hashed_pw',
    displayName: 'Existing User',
    birthDate: null,
    gender: null,
    avatarUrl: null,
    name: 'Existing User',
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function memoryRepository(
  seedUsers: IdentityRecord[] = [],
  seedIdentities: FederatedIdentityRecord[] = []
): IdentityRepository & { users: IdentityRecord[]; identities: FederatedIdentityRecord[] } {
  const users = [...seedUsers];
  const identities = [...seedIdentities];

  return {
    users,
    identities,
    async findByEmail(email) {
      return users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    },
    async findByUsername(username) {
      return users.find((u) => u.username?.toLowerCase() === username.toLowerCase());
    },
    async create(input: CreateIdentityInput) {
      const created = mockIdentity({
        ...input,
        id: `10000000-0000-4000-8000-${String(users.length + 1).padStart(12, '0')}`
      });
      users.push(created);
      return created;
    },
    async findIdentity(provider, providerSubject) {
      const link = identities.find(
        (i) => i.provider === provider && i.providerSubject === providerSubject
      );
      if (!link) return undefined;
      return users.find((u) => u.id === link.userId);
    },
    async createWithIdentity(input: CreateFederatedIdentityInput, provider, providerSubject) {
      const exists = identities.find(
        (i) => i.provider === provider && i.providerSubject === providerSubject
      );
      if (exists) {
        throw new ApiError(409, 'IDENTITY_ALREADY_EXISTS');
      }
      const created = mockIdentity({
        id: `10000000-0000-4000-8000-${String(users.length + 1).padStart(12, '0')}`,
        email: input.email.toLowerCase(),
        displayName: input.displayName,
        name: input.displayName,
        avatarUrl: input.avatarUrl ?? null,
        username: null,
        passwordHash: null
      });
      users.push(created);
      identities.push({
        userId: created.id,
        provider,
        providerSubject
      });
      return created;
    }
  };
}

test('verifyGoogleCredential validates input and fails safely', async () => {
  // Missing or non-string credential
  await assert.rejects(
    // @ts-expect-error test invalid input
    verifyGoogleCredential(null, 'test-client-id'),
    (err: unknown) => err instanceof ApiError && err.code === 'VALIDATION_ERROR'
  );

  // Missing client ID
  const oldEnv = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  try {
    await assert.rejects(
      verifyGoogleCredential('any-token'),
      (err: unknown) => err instanceof ApiError && err.code === 'GOOGLE_AUTH_UNCONFIGURED'
    );
  } finally {
    if (oldEnv) process.env.GOOGLE_CLIENT_ID = oldEnv;
  }

  // Malformed ID token fails with 401 INVALID_CREDENTIALS
  await assert.rejects(
    verifyGoogleCredential('invalid.jwt.token', 'test-client-id'),
    (err: unknown) => err instanceof ApiError && err.code === 'INVALID_CREDENTIALS'
  );
});

test('existing Google identity returns the same user without creating duplicates', async () => {
  const existingUser = mockIdentity({
    id: 'user-google-1',
    email: 'athlete@gmail.com',
    username: 'athlete1',
    displayName: 'Google Athlete'
  });
  const repo = memoryRepository([existingUser], [
    { userId: 'user-google-1', provider: 'google', providerSubject: 'google-sub-12345' }
  ]);

  const profile: GoogleAuthProfile = {
    sub: 'google-sub-12345',
    email: 'athlete@gmail.com',
    name: 'Google Athlete',
    picture: 'https://lh3.googleusercontent.com/a/photo'
  };

  const resolved = await authenticateWithGoogle(repo, profile);
  assert.equal(resolved.id, existingUser.id);
  assert.equal(repo.users.length, 1);
  assert.equal(repo.identities.length, 1);
});

test('new Google user creates user with username null (requiring onboarding) and links auth identity', async () => {
  const repo = memoryRepository();
  const profile: GoogleAuthProfile = {
    sub: 'google-sub-99999',
    email: 'newbie@gmail.com',
    name: 'New Athlete',
    picture: 'https://lh3.googleusercontent.com/photo.jpg'
  };

  const resolved = await authenticateWithGoogle(repo, profile);
  assert.ok(resolved.id);
  assert.equal(resolved.email, 'newbie@gmail.com');
  assert.equal(resolved.displayName, 'New Athlete');
  assert.equal(resolved.username, null);
  assert.equal(resolved.passwordHash, null);
  assert.equal(resolved.avatarUrl, 'https://lh3.googleusercontent.com/photo.jpg');

  // Verify auth_identities link
  assert.equal(repo.identities.length, 1);
  assert.equal(repo.identities[0].userId, resolved.id);
  assert.equal(repo.identities[0].provider, 'google');
  assert.equal(repo.identities[0].providerSubject, 'google-sub-99999');

  // toAuthUser sets username to empty string so frontend detects onboarding is needed
  const authUser = toAuthUser(resolved);
  assert.equal(authUser.username, '');
});

test('local email account conflict rejects Google login with ACCOUNT_LINKING_REQUIRED (prevents account takeover)', async () => {
  const localUser = mockIdentity({
    id: 'local-user-id',
    email: 'registered_with_password@example.com',
    username: 'legit_user',
    passwordHash: 'scrypt$dummy'
  });
  const repo = memoryRepository([localUser]);

  const maliciousGoogleProfile: GoogleAuthProfile = {
    sub: 'attacker-or-victim-google-sub',
    email: 'registered_with_password@example.com',
    name: 'Attacker'
  };

  await assert.rejects(
    authenticateWithGoogle(repo, maliciousGoogleProfile),
    (err: unknown) => err instanceof ApiError && err.code === 'ACCOUNT_LINKING_REQUIRED'
  );

  // Verify no new user or identity was added or altered
  assert.equal(repo.users.length, 1);
  assert.equal(repo.identities.length, 0);
  assert.equal(repo.users[0].id, 'local-user-id');
});

test('duplicate identity creation is rejected', async () => {
  const repo = memoryRepository();
  const profile: GoogleAuthProfile = {
    sub: 'same-sub',
    email: 'first@gmail.com',
    name: 'First'
  };
  await authenticateWithGoogle(repo, profile);

  // Directly attempting to link same provider + providerSubject throws
  await assert.rejects(
    repo.createWithIdentity({ email: 'second@gmail.com', displayName: 'Second' }, 'google', 'same-sub'),
    (err: unknown) => err instanceof ApiError && err.code === 'IDENTITY_ALREADY_EXISTS'
  );
});
