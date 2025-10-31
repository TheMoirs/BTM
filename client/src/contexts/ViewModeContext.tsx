import { createContext, useContext, ReactNode, useMemo } from 'react';
import { useLocation } from 'wouter';

interface ViewModeContextType {
  isReadOnly: boolean;
  getShareableLink: () => string;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(undefined);

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  
  // Check if URL has ?view=readonly parameter
  // Use useMemo to re-evaluate when location changes (for client-side navigation)
  const isReadOnly = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('view') === 'readonly';
  }, [location]); // Re-evaluate when location changes

  const getShareableLink = () => {
    const baseUrl = window.location.origin;
    // Parse current URL to properly handle existing query parameters
    const url = new URL(window.location.href);
    // Set or update the view parameter to readonly
    url.searchParams.set('view', 'readonly');
    return url.toString();
  };

  return (
    <ViewModeContext.Provider value={{ isReadOnly, getShareableLink }}>
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
