import type { TaskCookieCredentialSummary } from "@/api/task";

export type CookieCredentialMatchType = "exact" | "suffix";

export type CookieCredentialMatchResult = {
  credential: TaskCookieCredentialSummary;
  host: string;
  domain: string;
  matchType: CookieCredentialMatchType;
};

type RankedCookieCredentialMatch = CookieCredentialMatchResult & {
  score: number;
};

type CookieCredentialStatusLike = Partial<
  Pick<
    TaskCookieCredentialSummary,
    "status" | "expiresAt" | "isExpired" | "isExpiringSoon" | "isUsable" | "statusMessage"
  >
>;

export function extractHostnameFromUrl(input?: string | null) {
  const value = String(input || "").trim();
  if (!value) {
    return "";
  }

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function normalizeCookieCredentialDomain(input?: string | null) {
  const value = String(input || "").trim().toLowerCase();
  if (!value) {
    return "";
  }

  try {
    if (value.startsWith("http://") || value.startsWith("https://")) {
      return new URL(value).hostname.toLowerCase();
    }
  } catch {
    return "";
  }

  return value
    .replace(/^\.+/, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

export function getCookieCredentialStatus(credential?: CookieCredentialStatusLike | null) {
  if (!credential) {
    return "active" as const;
  }

  if (credential.status === "expired" || credential.isExpired) {
    return "expired" as const;
  }

  if (credential.status === "expiring_soon" || credential.isExpiringSoon) {
    return "expiring_soon" as const;
  }

  const expiresAt = String(credential.expiresAt || "").trim();
  if (!expiresAt) {
    return "active" as const;
  }

  const expiresAtTime = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresAtTime)) {
    return "active" as const;
  }

  const now = Date.now();
  if (expiresAtTime <= now) {
    return "expired" as const;
  }

  if (expiresAtTime - now <= 7 * 24 * 60 * 60 * 1000) {
    return "expiring_soon" as const;
  }

  return "active" as const;
}

export function isCookieCredentialUsable(credential?: CookieCredentialStatusLike | null) {
  if (!credential) {
    return false;
  }

  if (typeof credential.isUsable === "boolean") {
    return credential.isUsable;
  }

  return getCookieCredentialStatus(credential) !== "expired";
}

export function getCookieCredentialStatusMeta(
  credential?: CookieCredentialStatusLike | null,
) {
  const status = getCookieCredentialStatus(credential);
  if (status === "expired") {
    return {
      status,
      label: "已过期",
      tagType: "danger" as const,
      message:
        String(credential?.statusMessage || "").trim() ||
        "Cookie 凭证已过期，请先更新后再使用",
    };
  }

  if (status === "expiring_soon") {
    return {
      status,
      label: "即将过期",
      tagType: "warning" as const,
      message:
        String(credential?.statusMessage || "").trim() ||
        "Cookie 凭证即将过期，建议尽快更新",
    };
  }

  return {
    status,
    label: "可用",
    tagType: "success" as const,
    message: String(credential?.statusMessage || "").trim() || "Cookie 凭证可用",
  };
}

export function findCookieCredentialById(
  credentials: TaskCookieCredentialSummary[],
  credentialId?: number | null,
) {
  const normalizedId = Number(credentialId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    return null;
  }

  return credentials.find((item) => item.id === normalizedId) || null;
}

export function isCookieCredentialMatchingUrl(
  credential:
    | Pick<
        TaskCookieCredentialSummary,
        "cookieDomain" | "status" | "expiresAt" | "isExpired" | "isUsable" | "isExpiringSoon"
      >
    | null
    | undefined,
  taskUrl?: string | null,
) {
  const host = extractHostnameFromUrl(taskUrl);
  const domain = normalizeCookieCredentialDomain(credential?.cookieDomain);

  if (!host || !domain || !isCookieCredentialUsable(credential)) {
    return false;
  }

  return host === domain || host.endsWith(`.${domain}`);
}

export function findBestMatchingCookieCredential(
  credentials: TaskCookieCredentialSummary[],
  taskUrl?: string | null,
): CookieCredentialMatchResult | null {
  const host = extractHostnameFromUrl(taskUrl);
  if (!host) {
    return null;
  }

  const rankedMatches = credentials
    .map((credential) => {
      if (!isCookieCredentialUsable(credential)) {
        return null;
      }

      const domain = normalizeCookieCredentialDomain(credential.cookieDomain);
      if (!domain) {
        return null;
      }

      const exactMatch = host === domain;
      const suffixMatch = host.endsWith(`.${domain}`);
      if (!exactMatch && !suffixMatch) {
        return null;
      }

      const matchType: CookieCredentialMatchType = exactMatch ? "exact" : "suffix";

      return {
        credential,
        host,
        domain,
        matchType,
        score: (exactMatch ? 2 : 1) * 1000 + domain.length,
      } satisfies RankedCookieCredentialMatch;
    })
    .filter((item): item is RankedCookieCredentialMatch => Boolean(item))
    .sort((left, right) => right.score - left.score);

  const bestMatch = rankedMatches[0];
  if (!bestMatch) {
    return null;
  }

  return {
    credential: bestMatch.credential,
    host: bestMatch.host,
    domain: bestMatch.domain,
    matchType: bestMatch.matchType,
  };
}
