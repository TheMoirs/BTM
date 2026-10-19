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

export function openPdfMobile(doc: jsPDF, filename: string): boolean {
  try {
    // Get blob URL directly from jsPDF - this is synchronous
    const blobUrl = doc.output('bloburl');
    
    // Try opening in new tab first
    const newWindow = window.open(String(blobUrl), '_blank');
    
    if (newWindow) {
      return true;
    }
    
    // If popup was blocked, try direct save
    doc.save(filename);
    return true;
  } catch (error) {
    console.error('Failed to open PDF on mobile:', error);
    
    // Fallback: try save method
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
