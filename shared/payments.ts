// Team registration fees: formatting, payment references, "Pay now" links and
// bank detail checks. Shared by the server (emails, validation) and the pages.

export const FEE_CURRENCIES = [
  { code: "GBP", symbol: "£", label: "£ GBP" },
  { code: "EUR", symbol: "€", label: "€ EUR" },
  { code: "USD", symbol: "$", label: "$ USD" },
] as const;

export type FeeCurrency = (typeof FEE_CURRENCIES)[number]["code"];

export function isFeeCurrency(v: unknown): v is FeeCurrency {
  return FEE_CURRENCIES.some((c) => c.code === v);
}

/** 1050, "GBP" -> "£10.50"; whole amounts drop the pence: 1000 -> "£10" */
export function formatFee(minor: number, currency: string): string {
  const c = FEE_CURRENCIES.find((x) => x.code === currency) ?? FEE_CURRENCIES[0];
  const amount = minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
  return `${c.symbol}${amount}`;
}

/** "10.50" -> 1050; "" -> null; anything else invalid -> NaN */
export function parseFeeInput(text: string): number | null {
  const t = text.trim().replace(/^[£€$]/, "").replace(/,/g, "");
  if (t === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  return Math.round(parseFloat(t) * 100);
}

/**
 * Reference for the payment, so the organiser can match it to the team:
 * the team name in capitals, letters/numbers/spaces only, at most 18 characters
 * (the UK bank-transfer limit).
 */
export function paymentReference(teamName: string): string {
  const clean = teamName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // é -> e
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (clean || "TEAM FEE").slice(0, 18).trim();
}

export type PaymentLinkKind = "monzo" | "paypal" | "other";

/** Recognise what the organiser pasted: monzo.me/name, paypal.me/name, or another https link */
export function describePaymentLink(raw: string): { kind: PaymentLinkKind; handle?: string; url: string } | null {
  const v = raw.trim();
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const parts = u.pathname.split("/").filter(Boolean);
  if (host === "monzo.me" && parts[0]) {
    return { kind: "monzo", handle: parts[0], url: `https://monzo.me/${parts[0]}` };
  }
  if ((host === "paypal.me" && parts[0]) || (host === "paypal.com" && parts[0] === "paypalme" && parts[1])) {
    const handle = host === "paypal.me" ? parts[0] : parts[1];
    return { kind: "paypal", handle, url: `https://paypal.me/${handle}` };
  }
  return { kind: "other", url: u.toString() };
}

/** The "Pay now" address, with the amount (and reference where supported) filled in */
export function buildPayNowUrl(rawLink: string, minor: number, currency: string, reference: string): string | null {
  const link = describePaymentLink(rawLink);
  if (!link) return null;
  const amount = (minor / 100).toFixed(2);
  if (link.kind === "monzo") {
    // Monzo.me only takes pounds; for other currencies just open the page
    return currency === "GBP"
      ? `https://monzo.me/${link.handle}/${amount}?d=${encodeURIComponent(reference)}`
      : link.url;
  }
  if (link.kind === "paypal") {
    return `https://paypal.me/${link.handle}/${amount}${currency}`;
  }
  return link.url;
}

// ── Bank details ─────────────────────────────────────────────────────────────

export function normaliseSortCode(v: string): string {
  return v.replace(/\D/g, "");
}
export function formatSortCode(v: string): string {
  const d = normaliseSortCode(v);
  return d.length === 6 ? `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}` : v;
}
export function normaliseIban(v: string): string {
  return v.replace(/\s+/g, "").toUpperCase();
}
export function formatIban(v: string): string {
  return normaliseIban(v).replace(/(.{4})/g, "$1 ").trim();
}

/** Standard IBAN check (country code, length and the mod-97 checksum) */
export function isValidIban(v: string): boolean {
  const iban = normaliseIban(v);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

export type PayeeDetails = {
  accountName: string | null;
  sortCode: string | null;
  accountNumber: string | null;
  iban: string | null;
  paymentLink: string | null;
};

/** Checks the organiser's details; returns a message for the first problem, or null if fine */
export function payeeDetailsProblem(d: PayeeDetails): string | null {
  const hasUk = !!(d.sortCode || d.accountNumber);
  if (hasUk) {
    if (!d.sortCode || normaliseSortCode(d.sortCode).length !== 6) return "The sort code should be 6 digits, e.g. 12-34-56.";
    if (!d.accountNumber || !/^\d{8}$/.test(d.accountNumber.replace(/\s/g, ""))) return "The account number should be 8 digits.";
  }
  if (d.iban && !isValidIban(d.iban)) return "That IBAN doesn't look right. Please check it.";
  if ((hasUk || d.iban) && !d.accountName?.trim()) return "Please add the name on the account, so payers' banks can confirm it.";
  if (d.paymentLink && !describePaymentLink(d.paymentLink)) return "The payment link should be a web address, e.g. monzo.me/yourname.";
  return null;
}
