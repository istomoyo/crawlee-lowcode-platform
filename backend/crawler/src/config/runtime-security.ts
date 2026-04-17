const DEFAULT_JWT_SECRET = 'your-secret-key-change-in-production';
const DEFAULT_AUTH_COOKIE_NAME = 'token';
const DEFAULT_AUTH_COOKIE_PATH = '/';

const DEFAULT_ALLOWED_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
];

export type AuthCookieSameSite = 'lax' | 'strict' | 'none';

export interface AuthCookieConfig {
  name: string;
  path: string;
  domain?: string;
  sameSite: AuthCookieSameSite;
  secure: boolean;
}

function normalizeNodeEnv(value?: string | null): string {
  const normalized = String(value ?? 'development').trim().toLowerCase();
  return normalized || 'development';
}

function normalizeOrigin(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  try {
    return new URL(trimmed).origin.toLowerCase();
  } catch {
    return trimmed.replace(/\/+$/, '').toLowerCase();
  }
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  return undefined;
}

function normalizeCookieDomain(value: string | undefined): string | undefined {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    return trimmed
      .replace(/^[a-z]+:\/\//i, '')
      .replace(/\/.*$/, '')
      .replace(/:\d+$/, '')
      .replace(/^\./, '')
      .toLowerCase();
  }
}

function normalizeSameSite(
  value: string | undefined,
): AuthCookieSameSite | undefined {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (
    normalized === 'lax' ||
    normalized === 'strict' ||
    normalized === 'none'
  ) {
    return normalized;
  }

  return undefined;
}

export function isProductionLikeEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const nodeEnv = normalizeNodeEnv(env.NODE_ENV);
  return nodeEnv !== 'development' && nodeEnv !== 'test';
}

export function resolveJwtSecret(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configuredSecret = String(env.JWT_SECRET ?? '').trim();
  const secret = configuredSecret || DEFAULT_JWT_SECRET;

  if (
    isProductionLikeEnvironment(env) &&
    (!configuredSecret || configuredSecret === DEFAULT_JWT_SECRET)
  ) {
    throw new Error(
      'JWT_SECRET must be set to a strong non-default value when NODE_ENV is not development/test.',
    );
  }

  return secret;
}

export function resolveCookieVaultSecret(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configuredSecret = String(env.COOKIE_VAULT_SECRET ?? '').trim();
  if (configuredSecret) {
    return configuredSecret;
  }

  if (isProductionLikeEnvironment(env)) {
    throw new Error(
      'COOKIE_VAULT_SECRET must be set to a strong non-default value when NODE_ENV is not development/test.',
    );
  }

  return `${resolveJwtSecret(env)}::cookie-vault`;
}

export function resolveAuthCookieConfig(
  env: NodeJS.ProcessEnv = process.env,
): AuthCookieConfig {
  const secure =
    parseBooleanEnv(env.AUTH_COOKIE_SECURE ?? env.COOKIE_SECURE) ??
    isProductionLikeEnvironment(env);
  const sameSite =
    normalizeSameSite(env.AUTH_COOKIE_SAME_SITE) ?? 'lax';

  if (sameSite === 'none' && !secure) {
    throw new Error(
      'AUTH_COOKIE_SAME_SITE=none requires AUTH_COOKIE_SECURE=true so browsers will accept the cookie.',
    );
  }

  return {
    name:
      String(env.AUTH_COOKIE_NAME ?? DEFAULT_AUTH_COOKIE_NAME).trim() ||
      DEFAULT_AUTH_COOKIE_NAME,
    path:
      String(env.AUTH_COOKIE_PATH ?? DEFAULT_AUTH_COOKIE_PATH).trim() ||
      DEFAULT_AUTH_COOKIE_PATH,
    domain: normalizeCookieDomain(env.AUTH_COOKIE_DOMAIN),
    sameSite,
    secure,
  };
}

export function isUnsafeCustomJsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const explicitFlag = parseBooleanEnv(env.ALLOW_UNSAFE_CUSTOM_JS);
  if (explicitFlag !== undefined) {
    return explicitFlag;
  }

  return !isProductionLikeEnvironment(env);
}

export function getAllowedCorsOrigins(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const configuredOrigins = String(env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);

  if (configuredOrigins.length > 0) {
    return configuredOrigins;
  }

  return DEFAULT_ALLOWED_CORS_ORIGINS.map((origin) => normalizeOrigin(origin));
}

export function isOriginAllowed(
  origin: string | null | undefined,
  allowedOrigins = getAllowedCorsOrigins(),
): boolean {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  return allowedOrigins.some(
    (allowedOrigin) =>
      allowedOrigin === '*' || normalizeOrigin(allowedOrigin) === normalizedOrigin,
  );
}

export { DEFAULT_ALLOWED_CORS_ORIGINS, DEFAULT_JWT_SECRET };
