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
    const pdfBlob = doc.output('blob');
    
    // Try Web Share API first (best UX on mobile)
    if (navigator.canShare && navigator.canShare({ files: [new File([pdfBlob], filename, { type: 'application/pdf' })] })) {
      const file = new File([pdfBlob], filename, { type: 'application/pdf' });
      await navigator.share({
        files: [file],
        title: filename,
      });
      return true;
    }
    
    // Fallback: Try opening data URI in same window
    try {
      const dataUri = doc.output('datauristring');
      window.location.href = dataUri;
      return true;
    } catch (error) {
      // Final fallback: Trigger download via anchor element
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Delay cleanup to ensure download completes
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    }
  } catch (error) {
    console.error('Failed to open PDF on mobile:', error);
    return false;
  }
}

export async function shortenUrl(longUrl: string): Promise<string | null> {
  try {
    const response = await fetch('https://urlfy.org/api/v1/shorten', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: longUrl }),
    });
    
    if (!response.ok) {
      console.error('URL shortening failed:', response.statusText);
      return null;
    }
    
    const data = await response.json();
    return data.shortUrl || null;
  } catch (error) {
    console.error('Error shortening URL:', error);
    return null;
  }
}
