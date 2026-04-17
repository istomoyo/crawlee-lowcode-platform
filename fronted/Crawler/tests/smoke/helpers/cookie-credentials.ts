import type { APIResponse, Page } from "@playwright/test";

export type SmokeCookieCredential = {
  id: number;
  name: string;
  cookieDomain: string;
  cookieCount: number;
  hasNotes: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ApiEnvelope<T> = {
  code: number;
  message: string;
  path: string;
  data: T;
};

type CreateCookieCredentialPayload = {
  name: string;
  cookieString: string;
  cookieDomain?: string;
  notes?: string;
  expiresAt?: string;
};

async function readEnvelope<T>(page: Page, responsePromise: Promise<APIResponse>) {
  const response = await responsePromise;
  if (!response.ok()) {
    throw new Error(`Request failed with status ${response.status()}`);
  }

  const payload = (await response.json()) as ApiEnvelope<T>;
  return payload.data;
}

export async function listCookieCredentials(page: Page) {
  return await readEnvelope<SmokeCookieCredential[]>(
    page,
    page.request.get("/api/task/cookie-credentials"),
  );
}

export async function createCookieCredential(
  page: Page,
  payload: CreateCookieCredentialPayload,
) {
  return await readEnvelope<SmokeCookieCredential>(
    page,
    page.request.post("/api/task/cookie-credentials", {
      data: payload,
    }),
  );
}

export async function deleteCookieCredential(page: Page, credentialId: number) {
  return await readEnvelope<{ id: number; name: string }>(
    page,
    page.request.delete(`/api/task/cookie-credentials/${credentialId}`),
  );
}

export async function cleanupCookieCredentialsByPrefix(page: Page, prefix: string) {
  const credentials = await listCookieCredentials(page);
  const targets = credentials.filter((item) => item.name.startsWith(prefix));

  for (const item of targets) {
    await deleteCookieCredential(page, item.id);
  }
}
