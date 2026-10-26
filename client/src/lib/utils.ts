import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type jsPDF from "jspdf"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  
  const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  return hasCoarsePointer || isTouchDevice || mobileUA;
}

/**
 * Show a PDF made in the browser under a proper file name, in a frame (by its
 * name) or a new tab ("_blank"). The PDF is sent to the server and comes straight
 * back, so the browser's viewer saves it as `filename` instead of a random name.
 */
export function showNamedPdf(doc: jsPDF, filename: string, target: string): void {
  const title = filename.replace(/\.pdf$/i, "");
  try {
    doc.setProperties({ title });
  } catch {
    /* title is just a nicety */
  }
  const base64 = String(doc.output("datauristring")).split(",")[1] || "";
  const form = document.createElement("form");
  form.method = "POST";
  form.action = `/api/pdf/${encodeURIComponent(filename)}`;
  form.target = target;
  form.style.display = "none";
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "pdf";
  input.value = base64;
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
  form.remove();
}

/** Event that opens the phone print page (components/mobile-pdf-viewer.tsx) */
export const MOBILE_PDF_EVENT = "ptm:show-pdf";
export type MobilePdfRequest = { doc: jsPDF; filename: string };

export function openPdfMobile(doc: jsPDF, filename: string): boolean {
  try {
    // Phone PDF viewers (Android Chrome especially) have no Print button, so show
    // the report on our own print page, which has Print and Save PDF buttons
    window.dispatchEvent(new CustomEvent<MobilePdfRequest>(MOBILE_PDF_EVENT, { detail: { doc, filename } }));
    return true;
  } catch (error) {
    console.error('Failed to open PDF on mobile:', error);
    try {
      doc.save(filename);
      return true;
    } catch (saveError) {
      console.error('Save fallback also failed:', saveError);
      return false;
    }
  }
}

export async function shortenUrl(longUrl: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch('https://urlfy.org/api/v1/shorten', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: longUrl }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error('URL shortening failed:', response.statusText);
      return null;
    }
    
    const data = await response.json();
    return data.shortUrl || null;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('URL shortening timeout');
    } else {
      console.error('Error shortening URL:', error);
    }
    return null;
  }
}

const urlCache = new Map<string, string>();

export async function getShareableShortLink(
  longUrl: string,
  cacheKey: string
): Promise<{ url: string; isShortened: boolean }> {
  if (urlCache.has(cacheKey)) {
    return { url: urlCache.get(cacheKey)!, isShortened: true };
  }
  
  const shortUrl = await shortenUrl(longUrl);
  
  if (shortUrl) {
    urlCache.set(cacheKey, shortUrl);
    return { url: shortUrl, isShortened: true };
  }
  
  return { url: longUrl, isShortened: false };
}

/**
 * A descriptive download filename, e.g.
 *   "Shamboules Winter Tournament 2026-27 - Matches - Division A - Completed - 2026-10-19.xlsx"
 * `details` are the filters in use (left out when empty). Characters Windows/macOS
 * don't allow in filenames are removed.
 */
export function exportFilename(
  tournamentName: string | null | undefined,
  data: string,
  details: (string | null | undefined | false)[],
  ext: "pdf" | "xlsx",
): string {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const parts = [tournamentName?.trim() || "Tournament", data, ...details.filter(Boolean) as string[], date];
  const name = parts
    .join(" - ")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return `${name}.${ext}`;
}
