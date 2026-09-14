type ViteEnvironment = {
  VITE_API_URL?: string;
  DEV?: boolean;
};

function environment(): ViteEnvironment {
  return (import.meta as ImportMeta & { env?: ViteEnvironment }).env || {};
}

function configuredApiBase(): string | undefined {
  const value = environment().VITE_API_URL?.trim();
  return value ? value.replace(/\/+$/, '') : undefined;
}

/**
 * Local development remains zero-config. A production build must receive its
 * API origin at build time; it must never silently call localhost.
 */
export class ApiBaseConfigurationError extends Error {
  constructor() {
    super('VITE_API_URL is required for production builds');
    this.name = 'ApiBaseConfigurationError';
  }
}

export function apiEndpoint(path: `/api/${string}`): string {
  const base = configuredApiBase();
  if (base) return `${base}${path}`;
  if (environment().DEV) return `http://localhost:4000${path}`;
  throw new ApiBaseConfigurationError();
}
