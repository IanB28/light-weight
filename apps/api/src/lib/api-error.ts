import type { NextFunction, Request, Response } from 'express';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message = code
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function asyncRoute<T extends Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: T, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'NOT_FOUND' });
}

function isMalformedJsonError(error: unknown): boolean {
  if (!(error instanceof SyntaxError) || !error || typeof error !== 'object') return false;
  const parserError = error as SyntaxError & { type?: unknown; status?: unknown };
  return parserError.type === 'entity.parse.failed' && parserError.status === 400;
}

function isRequestTooLarge(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const parserError = error as { type?: unknown; status?: unknown };
  return parserError.type === 'entity.too.large' && parserError.status === 413;
}

export function apiErrorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: error.code });
    return;
  }
  if (isMalformedJsonError(error)) {
    res.status(400).json({ error: 'INVALID_JSON' });
    return;
  }
  if (isRequestTooLarge(error)) {
    res.status(422).json({ error: req.originalUrl.startsWith('/api/auth/avatar') ? 'AVATAR_TOO_LARGE' : 'VALIDATION_ERROR' });
    return;
  }
  const failure = error as { name?: unknown; code?: unknown } | null;
  const databaseCode = typeof failure?.code === 'string' ? failure.code : undefined;
  console.error('[API_ERROR]', {
    method: req.method,
    path: req.path,
    name: typeof failure?.name === 'string' ? failure.name : 'UnknownError',
    code: databaseCode
  });
  if (databaseCode === '42703') {
    res.status(503).json({ error: 'DB_SCHEMA_MISMATCH' });
    return;
  }
  res.status(500).json({ error: 'SERVER_ERROR' });
}
