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

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
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
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
