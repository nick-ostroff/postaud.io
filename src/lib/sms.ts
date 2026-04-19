import { env } from "./env";

/** Replaces {first_name} and {link} tokens in an SMS body. */
export function renderSms(template: string, firstName: string, token: string): string {
  const link = `${env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/c/${token}`;
  return template
    .replaceAll("{first_name}", firstName || "there")
    .replaceAll("{link}", link);
}
