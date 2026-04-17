import {
  getAllowedCorsOrigins,
  isOriginAllowed,
  isProductionLikeEnvironment,
  isUnsafeCustomJsEnabled,
  resolveAuthCookieConfig,
  resolveJwtSecret,
} from './runtime-security';

describe('runtime security helpers', () => {
  it('treats development and test as non-production-like environments', () => {
    expect(
      isProductionLikeEnvironment({ NODE_ENV: 'development' } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      isProductionLikeEnvironment({ NODE_ENV: 'test' } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      isProductionLikeEnvironment({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(
      isProductionLikeEnvironment({ NODE_ENV: 'staging' } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it('rejects the default JWT secret in production-like environments', () => {
    expect(() =>
      resolveJwtSecret({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    ).toThrow(/JWT_SECRET/i);
  });

  it('allows the fallback JWT secret in test environments', () => {
    expect(
      resolveJwtSecret({ NODE_ENV: 'test' } as NodeJS.ProcessEnv),
    ).toBe('your-secret-key-change-in-production');
  });

  it('disables unsafe custom js by default in production-like environments', () => {
    expect(
      isUnsafeCustomJsEnabled({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      isUnsafeCustomJsEnabled({ NODE_ENV: 'test' } as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(
      isUnsafeCustomJsEnabled({
        NODE_ENV: 'production',
        ALLOW_UNSAFE_CUSTOM_JS: 'true',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it('normalizes and matches allowed cors origins', () => {
    const origins = getAllowedCorsOrigins({
      ALLOWED_ORIGINS: ' https://app.example.com/ , http://localhost:5173 ',
    } as NodeJS.ProcessEnv);

    expect(origins).toEqual([
      'https://app.example.com',
      'http://localhost:5173',
    ]);
    expect(isOriginAllowed('https://app.example.com', origins)).toBe(true);
    expect(isOriginAllowed('https://evil.example.com', origins)).toBe(false);
  });

  it('uses safe auth cookie defaults for local development', () => {
    expect(
      resolveAuthCookieConfig({ NODE_ENV: 'development' } as NodeJS.ProcessEnv),
    ).toEqual({
      name: 'token',
      path: '/',
      domain: undefined,
      sameSite: 'lax',
      secure: false,
    });
  });

  it('rejects SameSite=None auth cookies unless secure mode is enabled', () => {
    expect(() =>
      resolveAuthCookieConfig({
        NODE_ENV: 'development',
        AUTH_COOKIE_SAME_SITE: 'none',
        AUTH_COOKIE_SECURE: 'false',
      } as NodeJS.ProcessEnv),
    ).toThrow(/AUTH_COOKIE_SAME_SITE/i);
  });
});
