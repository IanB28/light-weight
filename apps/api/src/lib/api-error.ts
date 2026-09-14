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

export function apiErrorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: error.code });
    return;
  }
  const failure = error as { name?: unknown; code?: unknown } | null;
  console.error('[API_ERROR]', {
    name: typeof failure?.name === 'string' ? failure.name : 'UnknownError',
    code: typeof failure?.code === 'string' ? failure.code : undefined
  });
  res.status(500).json({ error: 'SERVER_ERROR' });
}
