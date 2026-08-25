import type { LinkShareProject, ShareAnnotation } from "@shared/collaboration";

class ShareApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new ShareApiError(
      body.error || `分享页面请求失败（${response.status}）`,
      response.status
    );
  }
  return (await response.json()) as T;
}

const endpoint = (action: string, token: string, extra = "") =>
  `/api/lite?action=${encodeURIComponent(action)}&token=${encodeURIComponent(token)}${extra}`;

export const shareApi = {
  authStatus: async (token: string) => {
    try {
      return await request<{
        accessMode: "open" | "passcode" | "member_email";
        required: boolean;
        authenticated: boolean;
        providerConfigured: boolean;
        viewer: {
          email: string;
          name: string;
          role: "internal" | "external";
        } | null;
      }>(endpoint("auth-status", token));
    } catch (error) {
      if (error instanceof ShareApiError && [400, 404].includes(error.status))
        return {
          accessMode: "open",
          required: false,
          authenticated: false,
          providerConfigured: false,
          viewer: null,
        } as const;
      throw error;
    }
  },
  requestEmailOtp: (token: string, email: string) =>
    request<{ ok: true; maskedEmail: string }>(endpoint("otp-request", token), {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  verifyEmailOtp: (token: string, email: string, code: string) =>
    request<{
      viewer: { email: string; name: string; role: "internal" | "external" };
    }>(endpoint("otp-verify", token), {
      method: "POST",
      body: JSON.stringify({ email, token: code }),
    }),
  passcodeVerify: (token: string, accessCode: string) =>
    request<{ ok: true; accessMode: "passcode" }>(
      endpoint("passcode-verify", token),
      {
        method: "POST",
        body: JSON.stringify({ accessCode }),
      }
    ),
  project: (token: string) =>
    request<LinkShareProject>(endpoint("share", token)),
  annotations: (token: string) =>
    request<{ revision: number; annotations: ShareAnnotation[] }>(
      endpoint("comments", token, "&after=0")
    ),
  comment: (
    token: string,
    input: {
      authorName: string;
      authorEmail?: string | null;
      body: string;
      fileId?: string | null;
      fieldKey?: string | null;
      pageNumber?: number | null;
      parentId?: string | null;
    }
  ) =>
    request<ShareAnnotation>(endpoint("comment", token), {
      method: "POST",
      body: JSON.stringify(input),
    }),
  resolve: (token: string, annotationId: string, resolved: boolean) =>
    request<ShareAnnotation>(endpoint("resolve", token), {
      method: "POST",
      body: JSON.stringify({ annotationId, resolved }),
    }),
};
