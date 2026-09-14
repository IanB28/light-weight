export type UserGender = 'male' | 'female';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  birthDate?: string;
  gender?: UserGender;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type FriendshipStatus = 'pending' | 'accepted';

export interface PublicUserSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}

export interface FriendshipSummary {
  id: string;
  status: FriendshipStatus;
  direction: 'incoming' | 'outgoing' | 'friend';
  user: PublicUserSummary;
  createdAt: string;
}

export type RoutineShareStatus = 'pending' | 'imported' | 'dismissed';

export interface RoutineShareSummary {
  id: string;
  sourceRoutineId?: string;
  sender: PublicUserSummary;
  routineName: string;
  routineDescription?: string;
  exerciseIds: string[];
  status: RoutineShareStatus;
  createdAt: string;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}

export function isValidEmail(value: string): boolean {
  const email = normalizeEmail(value);
  return email.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidUsername(value: string): boolean {
  return /^[a-z0-9._]{3,30}$/.test(normalizeUsername(value));
}
