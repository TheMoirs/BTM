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

  // Query the server to check actual access level
  const { data: accessLevel } = useQuery<{
    isMasterAdmin: boolean;
    isAdminAccess: boolean;
    isViewOnlyAccess: boolean;
    tournamentId: string | null;
  }>({
    queryKey: ['/api/auth/check-access'],
    enabled: true,
  });

  const isMasterAdmin = accessLevel?.isMasterAdmin ?? false;
  // isReadOnly should be true ONLY if we have view-only access (not admin or master admin)
  const isReadOnly = accessLevel?.isViewOnlyAccess ?? false;

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
