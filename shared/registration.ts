import { z } from "zod";

// Who teams contact if they need to change their details after registering.
// Shown on the registration page and in the confirmation email.
export const REGISTRATION_CONTACT = {
  name: "Ali Moir",
  email: "ali@themoirs.co.uk",
  whatsapp: "07970194190",
  // Same number in international form, for wa.me links
  whatsappIntl: "447970194190",
};

const required = (label: string) =>
  z.string({ required_error: `${label} is required` }).trim().min(1, `${label} is required`);

// What a team captain fills in on /register/<tournament>.
// Every field is mandatory; Division and Team ID are left for the organiser.
export const publicRegistrationSchema = z.object({
  name: required("Team name"),
  captainName: required("Captain name"),
  captainPhone: required("Phone number").refine(
    v => v.replace(/\D/g, "").length >= 7,
    "Please enter a valid phone number",
  ),
  captainEmail: required("Email").pipe(z.string().email("Please enter a valid email address")),
  homePiste: required("Home piste"),
  otherPlayers: z
    .array(z.string().trim(), { required_error: "Please enter at least one other player" })
    .transform(list => list.filter(p => p.length > 0))
    .pipe(z.array(z.string()).min(1, "Please enter at least one other player")),
});

export type PublicRegistration = z.infer<typeof publicRegistrationSchema>;
