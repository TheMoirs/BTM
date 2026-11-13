// What's on sale, as set by the system admin (Users page → Payments).
// Stored as JSON in app settings; anything missing falls back to the defaults.

import { storage } from "./storage";
import { normaliseSellingOptions, type SellingOptions } from "@shared/plans";

export const SELLING_SETTING = "selling_options";

export async function getSellingOptions(): Promise<SellingOptions> {
  const raw = await storage.getSetting(SELLING_SETTING);
  if (!raw) return normaliseSellingOptions(null);
  try {
    return normaliseSellingOptions(JSON.parse(raw));
  } catch {
    return normaliseSellingOptions(null);
  }
}
