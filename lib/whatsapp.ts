/**
 * Support WhatsApp contact.
 *
 * Lives in its own module — NOT inside the button component — because the
 * button is a "use client" file, and calling a plain function exported from a
 * client module inside a Server Component fails at runtime ("attempted to call
 * from the server"). TypeScript doesn't catch that, so keeping the helper here
 * is what makes it safe for both sides.
 */

/** +55 (19) 99924-5735 */
export const WHATSAPP_NUMBER = "5519999245735";

/** Build a wa.me link with a pre-filled message. */
export function whatsappLink(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
