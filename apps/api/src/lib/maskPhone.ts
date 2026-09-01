// Renders a phone number as a masked display string ("••• ••• 1234") — safe to show to
// Admin-scoped staff, unlike the raw number, which this system never returns to the client
// (see patient/services/CallService.ts and controller.ts's masked-call comments).
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const last4 = digits.slice(-4) || "----";
  return `••• ••• ${last4}`;
}
