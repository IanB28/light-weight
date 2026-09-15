import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from './password.js';
import { normalizedFriendPair } from '../routes/friends.js';
import { canMutateRoutine } from '../routes/routine-shares.js';
import { ApiError } from './api-error.js';
import { mapIdentityUniqueViolation, parseBirthDate, parseLoginInput, parseRegistrationInput } from './auth-validation.js';
import { assertCanSendFriendRequest, assertCanShareRoutine, assertRoutineHasNoCustomExercises, canAcceptFriendship, canManageFriendship, cloneRoutineSnapshot } from './social-invariants.js';
import { shouldUseSecureCookie } from './auth-session.js';
import { authenticateIdentity, registerIdentity } from './auth-service.js';
import type { CreateIdentityInput, IdentityRecord, IdentityRepository } from './identity-repository.js';

function identity(overrides: Partial<IdentityRecord> = {}): IdentityRecord {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: '10000000-0000-4000-8000-000000000001', email: 'ian@example.com', username: 'ian',
    passwordHash: null, displayName: 'Ian', birthDate: null, gender: null, avatarUrl: null,
    name: 'Ian', createdAt: now, updatedAt: now, ...overrides
  };
}

function memoryIdentityRepository(seed: IdentityRecord[] = []): IdentityRepository & { records: IdentityRecord[] } {
  const records = [...seed];
  return {
    records,
    async findByEmail(email) { return records.find((user) => user.email === email); },
    async findByUsername(username) { return records.find((user) => user.username === username); },
    async create(input: CreateIdentityInput) {
      const created = identity({ ...input, id: `10000000-0000-4000-8000-${String(records.length + 1).padStart(12, '0')}` });
      records.push(created);
      return created;
    },
    async findIdentity() { return undefined; },
    async createWithIdentity(input) {
      const created = identity({
        id: `10000000-0000-4000-8000-${String(records.length + 1).padStart(12, '0')}`,
        email: input.email,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl ?? null,
        username: null,
        passwordHash: null
      });
      records.push(created);
      return created;
    }
  };
}

test('passwords use a salted one-way scrypt representation', async () => {
  const encoded = await hashPassword('StrongPassword42');
  assert.match(encoded, /^scrypt\$/);
  assert.equal(encoded.includes('StrongPassword42'), false);
  assert.equal(await verifyPassword('StrongPassword42', encoded), true);
  assert.equal(await verifyPassword('wrong-password', encoded), false);
});

test('friend pairs are stable and cannot create inverted duplicates', () => {
  assert.deepEqual(normalizedFriendPair('user-b', 'user-a'), ['user-a', 'user-b']);
  assert.deepEqual(normalizedFriendPair('user-a', 'user-b'), ['user-a', 'user-b']);
});

test('routine ownership rejects cross-user mutation', () => {
  assert.equal(canMutateRoutine('user-a', 'user-a'), true);
  assert.equal(canMutateRoutine('user-a', 'user-b'), false);
});

test('register normalizes identity and validates password', () => {
  assert.deepEqual(parseRegistrationInput({ displayName: ' Ian ', username: ' @IanB28 ', email: ' IAN@Example.com ', password: 'StrongPass42' }), {
    displayName: 'Ian', username: 'ianb28', email: 'ian@example.com', password: 'StrongPass42'
  });
  assert.throws(() => parseRegistrationInput({ displayName: 'Ian', username: 'ian', email: 'bad', password: 'weak' }), ApiError);
});

test('login input uses a generic credential error and uniqueness errors stay typed', () => {
  assert.deepEqual(parseLoginInput({ email: ' A@B.com ', password: 'wrong-but-shaped' }), { email: 'a@b.com', password: 'wrong-but-shaped' });
  assert.throws(() => parseLoginInput({ email: 'bad', password: '' }), (error: unknown) => error instanceof ApiError && error.code === 'INVALID_CREDENTIALS');
  assert.throws(() => mapIdentityUniqueViolation({ code: '23505', constraint_name: 'users_email_normalized_uidx' }), (error: unknown) => error instanceof ApiError && error.code === 'EMAIL_ALREADY_EXISTS');
  assert.throws(() => mapIdentityUniqueViolation({ code: '23505', constraint_name: 'users_username_normalized_uidx' }), (error: unknown) => error instanceof ApiError && error.code === 'USERNAME_ALREADY_EXISTS');
});

test('profile birth dates are canonical and cannot be in the future', () => {
  const reference = new Date('2026-09-14T12:00:00.000Z');
  assert.equal(parseBirthDate('2000-02-29', reference), '2000-02-29');
  assert.equal(parseBirthDate(null, reference), null);
  assert.throws(() => parseBirthDate('2026-09-15', reference), (error: unknown) => error instanceof ApiError && error.code === 'INVALID_BIRTH_DATE');
  assert.throws(() => parseBirthDate('2025-02-30', reference), (error: unknown) => error instanceof ApiError && error.code === 'INVALID_BIRTH_DATE');
});

test('registration and login service work without exposing or storing plaintext credentials', async () => {
  const repository = memoryIdentityRepository();
  const created = await registerIdentity(repository, {
    displayName: 'Ian', username: 'Ian', email: 'IAN@example.com', password: 'StrongPassword42'
  });
  assert.equal(created.email, 'ian@example.com');
  assert.equal(created.passwordHash?.includes('StrongPassword42'), false);
  assert.equal((await authenticateIdentity(repository, { email: 'ian@example.com', password: 'StrongPassword42' })).id, created.id);
  await assert.rejects(authenticateIdentity(repository, { email: 'ian@example.com', password: 'WrongPassword42' }),
    (error: unknown) => error instanceof ApiError && error.code === 'INVALID_CREDENTIALS');
});

test('registration protects duplicate normalized email and username', async () => {
  const passwordHash = await hashPassword('StrongPassword42');
  const repository = memoryIdentityRepository([identity({ passwordHash })]);
  await assert.rejects(registerIdentity(repository, {
    displayName: 'Other', username: 'other', email: 'IAN@EXAMPLE.COM', password: 'StrongPassword42'
  }), (error: unknown) => error instanceof ApiError && error.code === 'EMAIL_ALREADY_EXISTS');
  await assert.rejects(registerIdentity(repository, {
    displayName: 'Other', username: 'IAN', email: 'other@example.com', password: 'StrongPassword42'
  }), (error: unknown) => error instanceof ApiError && error.code === 'USERNAME_ALREADY_EXISTS');
});

test('friend request invariants protect self, duplicate and third-party acceptance', () => {
  assert.throws(() => assertCanSendFriendRequest('a', 'a'), (error: unknown) => error instanceof ApiError && error.code === 'CANNOT_FRIEND_SELF');
  assert.throws(() => assertCanSendFriendRequest('a', 'b', 'pending'), (error: unknown) => error instanceof ApiError && error.code === 'FRIEND_REQUEST_EXISTS');
  const request = { userAId: 'a', userBId: 'b', requesterId: 'a', status: 'pending' };
  assert.equal(canAcceptFriendship(request, 'b'), true);
  assert.equal(canAcceptFriendship(request, 'a'), false);
  assert.equal(canAcceptFriendship(request, 'c'), false);
  assert.equal(canManageFriendship(request, 'a'), true);
  assert.equal(canManageFriendship(request, 'b'), true);
  assert.equal(canManageFriendship(request, 'c'), false);
});

test('routine sharing requires ownership and accepted friendship', () => {
  assert.doesNotThrow(() => assertCanShareRoutine({ ownerId: 'a', actorId: 'a', recipientId: 'b', areFriends: true }));
  assert.throws(() => assertCanShareRoutine({ ownerId: 'a', actorId: 'c', recipientId: 'b', areFriends: true }), (error: unknown) => error instanceof ApiError && error.code === 'ROUTINE_NOT_OWNED');
  assert.throws(() => assertCanShareRoutine({ ownerId: 'a', actorId: 'a', recipientId: 'b', areFriends: false }), (error: unknown) => error instanceof ApiError && error.code === 'NOT_FRIENDS');
  assert.throws(() => assertCanShareRoutine({ ownerId: 'a', actorId: 'a', recipientId: 'a', areFriends: true }), (error: unknown) => error instanceof ApiError && error.code === 'CANNOT_SHARE_WITH_SELF');
});

test('imported routine is an independent recipient-owned copy', () => {
  const source = { routineName: 'Push', routineDescription: null, exerciseIds: ['bench'] };
  const clone = cloneRoutineSnapshot(source, 'user-b', 'clone-id', {
    type: 'shared',
    sharedBy: { id: 'user-a', username: 'ian', displayName: 'Ian' },
    shareId: 'share-id'
  });
  clone.exerciseIds.push('dip');
  assert.deepEqual(source.exerciseIds, ['bench']);
  assert.equal(clone.userId, 'user-b');
  assert.equal(clone.origin?.sharedBy.username, 'ian');
});

test('sharing custom exercises is explicitly rejected instead of producing a broken routine', () => {
  assert.throws(() => assertRoutineHasNoCustomExercises(true),
    (error: unknown) => error instanceof ApiError && error.code === 'ROUTINE_HAS_CUSTOM_EXERCISES');
  assert.doesNotThrow(() => assertRoutineHasNoCustomExercises(false));
});

test('session cookies are Secure by default in production only', () => {
  assert.equal(shouldUseSecureCookie({ NODE_ENV: 'production' }), true);
  assert.equal(shouldUseSecureCookie({ NODE_ENV: 'development' }), false);
  assert.equal(shouldUseSecureCookie({ NODE_ENV: 'production', SESSION_COOKIE_SECURE: 'false' }), false);
  assert.equal(shouldUseSecureCookie({ NODE_ENV: 'development', SESSION_COOKIE_SECURE: 'true' }), true);
});
