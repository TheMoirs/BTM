import { createContext, useContext, ReactNode, useMemo, useEffect } from 'react';
import { useLocation } from 'wouter';
import type { Tournament } from '@shared/schema';

interface ViewModeContextType {
  isReadOnly: boolean;
  isMasterAdmin: boolean;
  viewToken: string | null;
  getShareableLink: (tournament: Tournament, token?: string) => string | null;
  loginMasterAdmin: (password: string) => Promise<boolean>;
  logoutMasterAdmin: () => void;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(undefined);

const VIEW_TOKEN_STORAGE_KEY = 'boules_view_token';
const MASTER_ADMIN_TOKEN_KEY = 'boules_master_admin_token';

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
    
    return localStorage.getItem(VIEW_TOKEN_STORAGE_KEY) || localStorage.getItem(MASTER_ADMIN_TOKEN_KEY);
  }, [location]);

  // Store token in localStorage when detected in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    
    if (urlToken) {
      // Check if it's a master admin token
      if (urlToken.startsWith('master_')) {
        localStorage.setItem(MASTER_ADMIN_TOKEN_KEY, urlToken);
        localStorage.removeItem(VIEW_TOKEN_STORAGE_KEY);
      } else {
        localStorage.setItem(VIEW_TOKEN_STORAGE_KEY, urlToken);
        localStorage.removeItem(MASTER_ADMIN_TOKEN_KEY);
      }
    } else if (!viewToken) {
      localStorage.removeItem(VIEW_TOKEN_STORAGE_KEY);
      localStorage.removeItem(MASTER_ADMIN_TOKEN_KEY);
    }
  }, [location, viewToken]);

  const isMasterAdmin = viewToken?.startsWith('master_') ?? false;
  const isReadOnly = viewToken !== null && !isMasterAdmin;

  const loginMasterAdmin = async (password: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/master-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        const { sessionToken } = await response.json();
        localStorage.setItem(MASTER_ADMIN_TOKEN_KEY, sessionToken);
        localStorage.removeItem(VIEW_TOKEN_STORAGE_KEY);
        
        // Redirect to apply the master admin token
        window.location.href = `/?token=${sessionToken}`;
        return true;
      }
      return false;
    } catch (error) {
      console.error('Master admin login failed:', error);
      return false;
    }
  };

  const logoutMasterAdmin = () => {
    localStorage.removeItem(MASTER_ADMIN_TOKEN_KEY);
    localStorage.removeItem(VIEW_TOKEN_STORAGE_KEY);
    window.location.href = '/';
  };

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
      loginMasterAdmin,
      logoutMasterAdmin 
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
