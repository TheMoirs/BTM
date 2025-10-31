import { createContext, useContext, ReactNode } from 'react';
import { useLocation } from 'wouter';

interface ViewModeContextType {
  isReadOnly: boolean;
  getShareableLink: () => string;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(undefined);

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  
  // Check if URL has ?view=readonly parameter
  const params = new URLSearchParams(window.location.search);
  const isReadOnly = params.get('view') === 'readonly';

  const getShareableLink = () => {
    const baseUrl = window.location.origin;
    const currentPath = location;
    return `${baseUrl}${currentPath}?view=readonly`;
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
