import { createContext, useContext, ReactNode, useMemo, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import type { Tournament } from '@shared/schema';
import { useQuery } from '@tanstack/react-query';

interface ViewModeContextType {
  isReadOnly: boolean;
  isMasterAdmin: boolean;
  viewToken: string | null;
  getShareableLink: (tournament: Tournament, token?: string) => string | null;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(undefined);

// sessionStorage: survives page refresh in the same tab but NOT new-tab or fresh visits,
// so the domain root always shows the login page when opened fresh.
const VIEW_TOKEN_STORAGE_KEY = 'boules_view_token';

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mounted, setMounted] = useState(false);
  
  // Ensure component is mounted before accessing window
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Extract token from URL or sessionStorage, prioritizing URL
  const viewToken = useMemo(() => {
    if (!mounted) return null;
    
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    
    if (urlToken) {
      return urlToken;
    }
    
    return sessionStorage.getItem(VIEW_TOKEN_STORAGE_KEY);
  }, [location, mounted]);

  // Store token in sessionStorage when detected in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    
    if (urlToken) {
      sessionStorage.setItem(VIEW_TOKEN_STORAGE_KEY, urlToken);
    }
    // Don't remove tokens when URL doesn't have one - tokens persist across navigation
  }, [location]);

  // Query the server to check actual access level (sent WITH session cookie).
  // Uses a custom queryFn so the viewToken is appended as a ?token= query
  // parameter — NOT joined into the path (which is what the default getQueryFn
  // would do with a two-element key like [url, token]).
  // The key includes viewToken so a different token always triggers a fresh fetch
  // and is never served from a stale admin-session cache entry.
  const { data: accessLevel } = useQuery<{
    isMasterAdmin: boolean;
    isAdminAccess: boolean;
    isViewOnlyAccess: boolean;
    tournamentId: string | null;
  }>({
    queryKey: ['check-access-session', viewToken],
    queryFn: async () => {
      const url = viewToken
        ? `/api/auth/check-access?token=${encodeURIComponent(viewToken)}`
        : '/api/auth/check-access';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: mounted,
    staleTime: Infinity,
  });

  // Token-only check (WITHOUT the session cookie) so that a logged-in admin
  // who visits a view-only share link still gets isViewOnlyAccess:true.
  // The middleware returns early with admin access for session users, which masks
  // the token type in the session-based query above.
  const [isTokenViewOnly, setIsTokenViewOnly] = useState(false);
  useEffect(() => {
    if (!viewToken || !mounted) {
      setIsTokenViewOnly(false);
      return;
    }
    fetch(`/api/auth/check-access?token=${encodeURIComponent(viewToken)}`, {
      credentials: 'omit', // no session cookie — pure token check
    })
      .then(r => r.json())
      .then(data => setIsTokenViewOnly(!!data.isViewOnlyAccess))
      .catch(() => setIsTokenViewOnly(false));
  }, [viewToken, mounted]);

  const isMasterAdmin = accessLevel?.isMasterAdmin ?? false;
  // isReadOnly: true when the session reports view-only access OR when the token
  // itself (checked without session) is a view token — covers system admins too.
  // But never treat a session-authenticated admin as read-only, even if a stale
  // view token is sitting in sessionStorage from a previous share-link visit.
  const hasAdminSession = accessLevel?.isAdminAccess || accessLevel?.isMasterAdmin;
  const isReadOnly = !hasAdminSession && (isTokenViewOnly || (accessLevel?.isViewOnlyAccess ?? false));

  const getShareableLink = (tournament: Tournament, token?: string) => {
    // Use provided token, or fall back to stored viewToken, or tournament.viewToken
    const shareToken = token || viewToken || tournament.viewToken;
    
    if (!shareToken) {
      return null;
    }

    const baseUrl = window.location.origin;
    const url = new URL(`${baseUrl}/`);
    url.searchParams.set('token', shareToken);
    url.searchParams.set('tournament', tournament.id);
    return url.toString();
  };

  return (
    <ViewModeContext.Provider value={{ 
      isReadOnly, 
      isMasterAdmin,
      viewToken, 
      getShareableLink,
    }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  const context = useContext(ViewModeContext);
  if (context === undefined) {
    throw new Error('useViewMode must be used within a ViewModeProvider');
  }
  return context;
}
