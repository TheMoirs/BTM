import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { publicRegistrationSchema, REGISTRATION_CONTACT } from "@shared/registration";
import { FeePaymentPanel, type FeePayment } from "@/components/fee-payment-panel";

type FormValues = {
  name: string;
  captainName: string;
  captainPhone: string;
  captainEmail: string;
  homePiste: string;
  otherPlayers: string; // one name per line while typing
};

type ExistingTeam = {
  id: string;
  name: string;
  captainName: string;
  captainPhone: string;
  captainEmail: string;
  homePiste: string;
  otherPlayers: string[];
};

const EMPTY: FormValues = { name: "", captainName: "", captainPhone: "", captainEmail: "", homePiste: "", otherPlayers: "" };

const FIELDS: { key: keyof FormValues; label: string; type?: string; autoComplete?: string; placeholder?: string }[] = [
  { key: "name", label: "Team name", placeholder: "Les Pétanqueurs" },
  { key: "captainName", label: "Captain's name", autoComplete: "name" },
  { key: "captainPhone", label: "Captain's phone number", type: "tel", autoComplete: "tel" },
  { key: "captainEmail", label: "Captain's email", type: "email", autoComplete: "email" },
  { key: "homePiste", label: "Home piste", placeholder: "e.g. The Crown, Bathwick" },
];

function toPayload(v: FormValues) {
  return { ...v, otherPlayers: v.otherPlayers.split("\n") };
}

function ContactDetails() {
  const c = REGISTRATION_CONTACT;
  return (
    <p className="text-sm text-muted-foreground">
      Your confirmation email includes a link to change your details. Any questions? Contact {c.name} by email at{" "}
      <a className="underline" href={`mailto:${c.email}`}>{c.email}</a> or on WhatsApp at{" "}
      <a className="underline" href={`https://wa.me/${c.whatsappIntl}`} target="_blank" rel="noreferrer">{c.whatsapp}</a>.
    </p>
  );
}

// "2026-10-31" -> "Saturday 31 October 2026"
function formatRegisterBy(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-xl space-y-6">
        <div className="flex items-center gap-3">
          <img src="/ptm-logo.png?v=2" alt="" className="h-10 w-10 rounded-lg object-cover" />
          <span className="font-semibold">Pétanque Tournament Manager</span>
        </div>
        {children}
      </div>
    </div>
  );
}

// Public page at /register/<tournament> where a team captain enters their team's details.
export default function RegisterTeamPage({ slug }: { slug: string }) {
  const [tournamentName, setTournamentName] = useState<string | null>(null);
  const [registerBy, setRegisterBy] = useState<string | null>(null);
  const [registrationFee, setRegistrationFee] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "missing" | "form" | "conflict" | "done">("loading");
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [honeypot, setHoneypot] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [existing, setExisting] = useState<ExistingTeam | null>(null);
  const [outcome, setOutcome] = useState<{ status: "created" | "updated"; emailSent: boolean; fee: FeePayment | null } | null>(null);
  const [discarded, setDiscarded] = useState(false);
  // From the "Need to change your details?" link in the confirmation email
  const [editCode] = useState(() => new URLSearchParams(window.location.search).get("edit"));
  const [editLinkError, setEditLinkError] = useState<string | null>(null);

  useEffect(() => {
    const base = `/api/public/register/${encodeURIComponent(slug)}`;
    (async () => {
      try {
        const r = await fetch(`/api/public/tournament/${encodeURIComponent(slug)}`);
        const data = r.ok ? await r.json() : null;
        if (!data?.name) return setState("missing");
        setTournamentName(data.name);
        setRegisterBy(formatRegisterBy(data.registrationDeadline));
        setRegistrationFee(data.registrationFee ?? null);
        document.title = `${editCode ? "Update registration" : "Register"} for ${data.name}`;

        if (editCode) {
          const tr = await fetch(`${base}/team?code=${encodeURIComponent(editCode)}`);
          const team = await tr.json().catch(() => ({}));
          if (tr.ok) {
            setValues({
              name: team.name,
              captainName: team.captainName,
              captainPhone: team.captainPhone,
              captainEmail: team.captainEmail,
              homePiste: team.homePiste,
              otherPlayers: (team.otherPlayers || []).join("\n"),
            });
          } else {
            setEditLinkError(team.error || "This link isn't valid any more.");
          }
        }
        setState("form");
      } catch {
        setState("missing");
      }
    })();
  }, [slug, editCode]);

  const isEditing = !!editCode && !editLinkError;

  const set = (key: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues(v => ({ ...v, [key]: e.target.value }));

  const submit = async (action: "create" | "update" | "edit") => {
    setError(null);
    const check = publicRegistrationSchema.safeParse(toPayload(values));
    if (!check.success) {
      setError(check.error.errors[0]?.message || "Please complete every field");
      setState("form");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/register/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...toPayload(values),
          website: honeypot,
          action,
          existingTeamId: action === "update" ? existing?.id : undefined,
          editCode: action === "edit" ? editCode : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.existing) {
        setExisting(data.existing);
        setState("conflict");
      } else if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setState("form");
      } else {
        setOutcome({ status: data.status, emailSent: !!data.emailSent, fee: data.fee ?? null });
        setState("done");
      }
    } catch {
      setError("Couldn't reach the server. Please check your connection and try again.");
      setState("form");
    } finally {
      setSubmitting(false);
    }
  };

  if (state === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state === "missing") {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle>Tournament not found</CardTitle>
            <CardDescription>
              There's no tournament at this address. It may have been renamed, so please ask the organiser for the latest link.
            </CardDescription>
          </CardHeader>
        </Card>
      </Shell>
    );
  }

  if (state === "done" && outcome) {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-green-600 dark:text-green-500">
              <CheckCircle2 className="h-6 w-6" />
              <CardTitle>{outcome.status === "updated" ? "Registration updated" : "Registration complete"}</CardTitle>
            </div>
            <CardDescription className="text-base pt-2">
              <strong className="text-foreground">{values.name.trim()}</strong> is registered for{" "}
              <strong className="text-foreground">{tournamentName}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {outcome.fee && <FeePaymentPanel fee={outcome.fee} />}
            <p className="text-sm">
              {outcome.emailSent
                ? <>A confirmation email with your details{outcome.fee ? " and how to pay" : ""} has been sent to <strong>{values.captainEmail.trim()}</strong>.</>
                : <>We couldn't send a confirmation email just now, but your registration has been saved.</>}
            </p>
            <ContactDetails />
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (state === "conflict" && existing) {
    const mine = toPayload(values);
    const rows: { label: string; old: string; next: string }[] = [
      { label: "Team name", old: existing.name, next: mine.name.trim() },
      { label: "Captain", old: existing.captainName, next: mine.captainName.trim() },
      { label: "Phone", old: existing.captainPhone, next: mine.captainPhone.trim() },
      { label: "Email", old: existing.captainEmail, next: mine.captainEmail.trim() },
      { label: "Home piste", old: existing.homePiste, next: mine.homePiste.trim() },
      {
        label: "Other players",
        old: existing.otherPlayers.join(", "),
        next: mine.otherPlayers.map(p => p.trim()).filter(Boolean).join(", "),
      },
    ];
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle>This team is already registered</CardTitle>
            <CardDescription>
              A team called <strong className="text-foreground">{existing.name}</strong> is already registered for{" "}
              {tournamentName}. Do you want to replace its details with the ones you've just entered?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-2 font-medium"></th>
                    <th className="p-2 font-medium">Currently registered</th>
                    <th className="p-2 font-medium">Your new details</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const changed = r.old.trim() !== r.next;
                    return (
                      <tr key={r.label} className="border-t align-top">
                        <td className="p-2 text-muted-foreground whitespace-nowrap">{r.label}</td>
                        <td className="p-2 break-words">{r.old || "—"}</td>
                        <td className={`p-2 break-words ${changed ? "font-semibold bg-amber-50 dark:bg-amber-950/40" : ""}`}>{r.next}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {error && (
              <div className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <Button
                variant="outline"
                disabled={submitting}
                onClick={() => {
                  setExisting(null);
                  setDiscarded(true);
                  setState("form");
                }}
                data-testid="button-discard-registration"
              >
                Discard my changes
              </Button>
              <Button disabled={submitting} onClick={() => submit("update")} data-testid="button-update-registration">
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Update registration
              </Button>
            </div>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{isEditing ? "Update your registration" : `Register for ${tournamentName}`}</CardTitle>
          <CardDescription className="text-base">
            {isEditing ? (
              <>Here are the details you registered for <strong className="text-foreground">{tournamentName}</strong>. Make any changes below and save. All fields are required.</>
            ) : (
              <>Thank you for your interest in <strong className="text-foreground">{tournamentName}</strong>.
              If you wish to compete, please enter your details below. All fields are required.</>
            )}
          </CardDescription>
          {registerBy && !isEditing && (
            <p className="pt-2 text-base font-semibold" data-testid="text-register-by">
              Please register by {registerBy}.
            </p>
          )}
          {registrationFee && !isEditing && (
            <p className="pt-1 text-base" data-testid="text-registration-fee">
              Registration fee: <strong>{registrationFee}</strong> per team. You can pay straight after registering.
            </p>
          )}
        </CardHeader>
        <CardContent>
          {editLinkError && (
            <p className="mb-4 rounded-md bg-muted p-3 text-sm">
              {editLinkError} You can register below, or contact {REGISTRATION_CONTACT.name} for help.
            </p>
          )}
          {discarded && (
            <p className="mb-4 rounded-md bg-muted p-3 text-sm">
              Nothing was changed — the existing registration was left as it was. If you're registering a different team, change the team name below and save again.
            </p>
          )}
          <form
            className="space-y-4"
            noValidate
            onSubmit={e => {
              e.preventDefault();
              setDiscarded(false);
              submit(isEditing ? "edit" : "create");
            }}
          >
            {FIELDS.map(f => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={f.key}>{f.label}</Label>
                <Input
                  id={f.key}
                  type={f.type || "text"}
                  autoComplete={f.autoComplete}
                  placeholder={f.placeholder}
                  value={values[f.key]}
                  onChange={set(f.key)}
                  required
                  disabled={submitting}
                  data-testid={`input-register-${f.key}`}
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label htmlFor="otherPlayers">Other players</Label>
              <Textarea
                id="otherPlayers"
                rows={4}
                placeholder={"One name per line\nMarie Dubois\nPierre Martin"}
                value={values.otherPlayers}
                onChange={set("otherPlayers")}
                required
                disabled={submitting}
                data-testid="input-register-otherPlayers"
              />
            </div>
            {/* Hidden from people; catches form-filling bots */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label htmlFor="website">Website</label>
              <input id="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={e => setHoneypot(e.target.value)} />
            </div>
            {error && (
              <div className="flex items-start gap-2 text-sm text-destructive" role="alert">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={submitting} data-testid="button-submit-registration">
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
              {isEditing ? "Save changes" : "Save registration"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <ContactDetails />
    </Shell>
  );
}
