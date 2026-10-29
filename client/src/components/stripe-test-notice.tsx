import { FlaskConical } from "lucide-react";

// Shown only while BTM uses Stripe test (sandbox) keys. No real money moves.

function Row({ label, value, plain = false }: { label: string; value: string; plain?: boolean }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3">
      <span className="text-amber-900/80 dark:text-amber-200/80">{label}</span>
      <span className={plain ? "font-medium" : "font-mono font-semibold"}>{value}</span>
    </div>
  );
}

/** "Test mode" box. `card` = paying by card; `onboarding` = setting up a Stripe account. */
export function StripeTestNotice({ kind }: { kind: "card" | "onboarding" }) {
  return (
    <div
      role="note"
      className="rounded-md border border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100 p-3 text-sm space-y-2"
      data-testid={`notice-stripe-test-${kind}`}
    >
      <p className="font-semibold flex items-center gap-1.5">
        <FlaskConical className="h-4 w-4" aria-hidden="true" />
        Stripe is in test mode
      </p>
      {kind === "card" ? (
        <>
          <p>No real money will be taken. On Stripe's payment page, use this test card:</p>
          <div className="space-y-0.5">
            <Row label="Card number" value="4242 4242 4242 4242" />
            <Row label="Expiry" value="any future date, e.g. 12/34" plain />
            <Row label="CVC" value="any 3 digits, e.g. 123" plain />
            <Row label="Name, postcode" value="anything" plain />
          </div>
          <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
            To test a declined card, use 4000 0000 0000 0002.
          </p>
        </>
      ) : (
        <>
          <p>This sets up a test Stripe account, so you can use made-up details. On Stripe's sign-up pages:</p>
          <div className="space-y-0.5">
            <Row label="Business type" value="Individual / sole trader" plain />
            <Row label="Mobile number" value="0000000000" />
            <Row label="SMS / email code" value="000000" />
            <Row label="Date of birth (exactly)" value="01/01/1901" />
            <Row label="Address line 1 (exactly)" value="address_full_match" />
            <Row label="Town, postcode" value="e.g. London, SW1A 1AA" plain />
            <Row label="ID number (if asked)" value="000000000" />
            <Row label="Website" value="https://accessible.stripe.com" />
            <Row label="Sort code" value="10-88-00" />
            <Row label="Account number" value="00012345" />
          </div>
          <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
            Any name will do, but use a real-looking town and postcode. If Stripe says it couldn't verify your details,
            check the date of birth and address line above, or choose to upload a document and use Stripe's{" "}
            <a href="https://d37ugbyn3rpeym.cloudfront.net/docs/identity/success.png" target="_blank" rel="noopener noreferrer" className="underline">
              test ID image
            </a>{" "}
            (or its "Use test image" button).
          </p>
        </>
      )}
    </div>
  );
}
