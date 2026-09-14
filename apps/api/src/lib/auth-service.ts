import { ApiError } from './api-error.js';
import { mapIdentityUniqueViolation, parseLoginInput, parseRegistrationInput } from './auth-validation.js';
import type { IdentityRecord, IdentityRepository } from './identity-repository.js';
import { hashPassword, verifyPassword } from './password.js';

const dummyPasswordHash = hashPassword('not-a-real-account-password-42');

export async function registerIdentity(repository: IdentityRepository, rawInput: unknown): Promise<IdentityRecord> {
  const input = parseRegistrationInput(rawInput);
  if (await repository.findByEmail(input.email)) throw new ApiError(409, 'EMAIL_ALREADY_EXISTS');
  if (await repository.findByUsername(input.username)) throw new ApiError(409, 'USERNAME_ALREADY_EXISTS');
  try {
    return await repository.create({
      email: input.email,
      username: input.username,
      displayName: input.displayName,
      passwordHash: await hashPassword(input.password)
    });
  } catch (error) {
    mapIdentityUniqueViolation(error);
  }
}

export async function authenticateIdentity(repository: IdentityRepository, rawInput: unknown): Promise<IdentityRecord> {
  const input = parseLoginInput(rawInput);
  const user = await repository.findByEmail(input.email);
  const matches = await verifyPassword(input.password, user?.passwordHash || await dummyPasswordHash);
  if (!user || !matches) throw new ApiError(401, 'INVALID_CREDENTIALS');
  return user;
}
