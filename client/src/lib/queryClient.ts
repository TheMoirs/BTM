import { QueryClient, QueryFunction } from "@tanstack/react-query";

const VIEW_TOKEN_STORAGE_KEY = 'boules_view_token';
const MASTER_ADMIN_TOKEN_KEY = 'boules_master_admin_token';

function getViewToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('token');
  
  if (urlToken) {
    return urlToken;
  }
  
  // Check both regular view tokens and master admin tokens
  return localStorage.getItem(VIEW_TOKEN_STORAGE_KEY) || localStorage.getItem(MASTER_ADMIN_TOKEN_KEY);
}

function appendTokenToUrl(url: string): string {
  const token = getViewToken();
  if (!token) return url;
  
  const urlObj = new URL(url, window.location.origin);
  urlObj.searchParams.set('token', token);
  return urlObj.toString();
}

/**
 * Called when a 401 is received. If the token was sourced from localStorage
 * (i.e. a previously-persisted share-link view token), it is now invalid.
 * Clear it and redirect to the login page with an "expired" flag so the
 * user sees a helpful message instead of a blank/broken screen.
 */
function handleUnauthorized() {
  const urlToken = new URLSearchParams(window.location.search).get('token');
  const persistedViewToken = localStorage.getItem(VIEW_TOKEN_STORAGE_KEY);

  // Only act when the token came from localStorage, not from the current URL.
  // If the URL carries a token, the server will reject it directly with 401 and
  // the user still has that link — we don't need to intervene here.
  if (!urlToken && persistedViewToken) {
    localStorage.removeItem(VIEW_TOKEN_STORAGE_KEY);
    localStorage.removeItem(MASTER_ADMIN_TOKEN_KEY);
    window.location.href = '/login?expired=1';
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (res.status === 401) {
      handleUnauthorized();
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const urlWithToken = appendTokenToUrl(url);
  const res = await fetch(urlWithToken, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    const urlWithToken = appendTokenToUrl(url);
    
    const res = await fetch(urlWithToken, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: (failureCount, error) => {
        // Don't retry HTTP errors (4xx, 5xx) — only network/connection errors
        if (error instanceof Error && /^\d{3}:/.test(error.message)) {
          return false;
        }
        return failureCount < 5;
      },
      retryDelay: 3000,
    },
    mutations: {
      retry: false,
    },
  },
});
