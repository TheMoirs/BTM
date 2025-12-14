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

export async function openPdfMobile(doc: jsPDF, filename: string): Promise<boolean> {
  try {
    // Use jsPDF's native save method - most reliable on mobile
    doc.save(filename);
    return true;
  } catch (error) {
    console.error('Failed to save PDF on mobile:', error);
    
    // Fallback: try blob URL approach
    try {
      const pdfBlob = doc.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return true;
    } catch (fallbackError) {
      console.error('Fallback download also failed:', fallbackError);
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
