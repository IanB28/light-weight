import { OAuth2Client } from 'google-auth-library';
import { isValidEmail, normalizeEmail } from '@light-weight/domain';
import { ApiError } from './api-error.js';

export interface GoogleProfilePayload {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

export async function verifyGoogleCredential(
  credential: string,
  expectedClientId?: string
): Promise<GoogleProfilePayload> {
  const clientId = expectedClientId || process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new ApiError(500, 'GOOGLE_AUTH_UNCONFIGURED');
  }
  if (!credential || typeof credential !== 'string') {
    throw new ApiError(422, 'VALIDATION_ERROR');
  }

  try {
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId
    });
    const payload = ticket.getPayload();
    if (!payload) {
      throw new ApiError(401, 'INVALID_CREDENTIALS');
    }
    if (!payload.sub || typeof payload.sub !== 'string') {
      throw new ApiError(401, 'INVALID_CREDENTIALS');
    }
    if (!payload.email || typeof payload.email !== 'string') {
      throw new ApiError(401, 'INVALID_CREDENTIALS');
    }
    if (payload.email_verified !== true) {
      throw new ApiError(401, 'UNVERIFIED_EMAIL');
    }
    const email = normalizeEmail(payload.email);
    if (!isValidEmail(email)) {
      throw new ApiError(422, 'INVALID_EMAIL');
    }

    return {
      sub: payload.sub,
      email,
      name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : undefined,
      picture: typeof payload.picture === 'string' && payload.picture.trim() ? payload.picture.trim() : undefined
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, 'INVALID_CREDENTIALS');
  }
}
