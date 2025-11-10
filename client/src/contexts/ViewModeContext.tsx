import { createContext, useContext, ReactNode, useMemo, useEffect } from 'react';
import { useLocation } from 'wouter';
import type { Tournament } from '@shared/schema';

interface ViewModeContextType {
  isReadOnly: boolean;
  viewToken: string | null;
  getShareableLink: (tournament: Tournament, token?: string) => string | null;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(undefined);

const VIEW_TOKEN_STORAGE_KEY = 'boules_view_token';

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  
  // Extract token from URL or localStorage, prioritizing URL
  // Use useMemo to re-evaluate when location changes (for client-side navigation)
  const viewToken = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    
    if (urlToken) {
      return urlToken;
    }
    
    return localStorage.getItem(VIEW_TOKEN_STORAGE_KEY);
  }, [location]);

  // Store token in localStorage when detected in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    
    if (urlToken) {
      localStorage.setItem(VIEW_TOKEN_STORAGE_KEY, urlToken);
    } else if (!viewToken) {
      localStorage.removeItem(VIEW_TOKEN_STORAGE_KEY);
    }
  }, [location, viewToken]);

  const isReadOnly = viewToken !== null;

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
    <ViewModeContext.Provider value={{ isReadOnly, viewToken, getShareableLink }}>
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
