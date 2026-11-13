import type { ReactNode } from "react";

/** The public home page (a static page, so a full page load rather than an app route) */
export const HOME_PAGE_URL = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/home/`;

/** Wraps the PTM logo so clicking it goes to the home page */
export function HomeLogoLink({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <a href={HOME_PAGE_URL} className={className} aria-label="PTM home page" title="PTM home page" data-testid="link-logo-home">
      {children}
    </a>
  );
}
