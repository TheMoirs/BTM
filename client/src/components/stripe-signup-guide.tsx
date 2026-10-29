import { ChevronDown } from "lucide-react";

function Item({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="space-y-0.5">
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground">{children}</p>
    </li>
  );
}

/**
 * What to choose on Stripe's sign-up pages (live or test). Stripe's wording and
 * order change from time to time, so this covers the usual questions.
 */
export function StripeSignupGuide() {
  return (
    <details className="group rounded-md border bg-muted/30 text-sm" data-testid="guide-stripe-signup">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 font-medium">
        What to choose on Stripe's sign-up pages
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ol className="list-decimal space-y-2 px-3 pb-3 pl-7 text-xs">
        <Item title="Type of business">
          Individual / sole trader, unless your club is a registered company or charity, in which case choose that.
        </Item>
        <Item title="Industry">
          The closest sports or recreation option, for example "Sports clubs" or "Recreational services".
        </Item>
        <Item title="Website or product description">
          Your club's website or social media page. If you don't have one, choose to add a product description instead,
          e.g. "Team entry fees for pétanque tournaments, paid online when teams register".
        </Item>
        <Item title="Statement descriptor (what captains see on their bank statement)">
          Something they'll recognise, 5 to 22 characters, e.g. "PETANQUE ENTRY" or your club's short name.
        </Item>
        <Item title="Customer support details">
          Your own phone number and email, so captains can contact you about a payment.
        </Item>
        <Item title="Bank account for payouts">
          The account where entry fees should go. Stripe pays out automatically (usually a few days after each payment);
          you can leave the payout schedule as it is.
        </Item>
        <Item title="Tax (e.g. &quot;Collect tax automatically&quot; / Stripe Tax)">
          Not needed for PTM: leave it off or choose "Skip" / "Not now". Only turn it on if you're VAT-registered and
          need to charge VAT on entry fees. If you're unsure, check with HMRC or an accountant.
        </Item>
        <Item title="Extras (Climate, invoicing, other products)">
          Optional; you can skip them. They don't affect card payments in PTM.
        </Item>
        <Item title="Two-step sign-in">
          Stripe asks you to protect your Stripe login with a code by text or an authenticator app. Set it up so you can
          get back into your Stripe Dashboard to see payments and payouts.
        </Item>
      </ol>
      <p className="px-3 pb-3 text-xs text-muted-foreground">
        When Stripe says you're done, come back to this tab: it shows "Connected" once Stripe has checked your details.
        Some checks can take a few minutes.
      </p>
    </details>
  );
}
