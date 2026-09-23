// Masks a phone number for display ("••• ••• 1234"), since the raw number is never returned to the client.
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const last4 = digits.slice(-4) || "----";
  return `••• ••• ${last4}`;
}
