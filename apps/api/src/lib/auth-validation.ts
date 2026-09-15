import { isValidEmail, isValidUsername, normalizeEmail, normalizeUsername } from '@light-weight/domain';
import { ApiError } from './api-error.js';

export interface RegistrationInput {
  email: string;
  username: string;
  displayName: string;
  password: string;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(422, 'VALIDATION_ERROR');
  return value as Record<string, unknown>;
}

function string(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max) throw new ApiError(422, 'VALIDATION_ERROR');
  return value;
}

export function validatePassword(password: string) {
  if (password.length < 10 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new ApiError(422, 'PASSWORD_TOO_WEAK');
  }
}

export function parseRegistrationInput(value: unknown): RegistrationInput {
  const body = record(value);
  const email = normalizeEmail(string(body.email, 255));
  const username = normalizeUsername(string(body.username, 30));
  const displayName = string(body.displayName, 100).trim();
  const password = string(body.password, 128);
  if (!isValidEmail(email)) throw new ApiError(422, 'INVALID_EMAIL');
  if (!isValidUsername(username)) throw new ApiError(422, 'INVALID_USERNAME');
  if (!displayName) throw new ApiError(422, 'VALIDATION_ERROR');
  validatePassword(password);
  return { email, username, displayName, password };
}

export function parseLoginInput(value: unknown): { email: string; password: string } {
  const body = record(value);
  const email = normalizeEmail(string(body.email, 255));
  const password = string(body.password, 128);
  if (!isValidEmail(email) || !password) throw new ApiError(401, 'INVALID_CREDENTIALS');
  return { email, password };
}

export function parseBirthDate(value: unknown, referenceDate = new Date()): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(422, 'INVALID_BIRTH_DATE');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  const canonical = Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
  const today = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()));
  if (canonical !== value || parsed > today) throw new ApiError(422, 'INVALID_BIRTH_DATE');
  return value;
}

export function mapIdentityUniqueViolation(error: unknown): never {
  const candidate = error as { code?: string; constraint_name?: string; constraint?: string };
  if (candidate?.code === '23505') {
    const constraint = candidate.constraint_name || candidate.constraint || '';
    if (constraint.includes('email')) throw new ApiError(409, 'EMAIL_ALREADY_EXISTS');
    if (constraint.includes('username')) throw new ApiError(409, 'USERNAME_ALREADY_EXISTS');
    if (constraint.includes('provider_subject') || constraint.includes('auth_identities')) throw new ApiError(409, 'IDENTITY_ALREADY_EXISTS');
  }
  throw error;
}
