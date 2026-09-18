/** Longueur maximale sûre d'un lien mailto : au-delà, certains clients mail tronquent le message. */
export const MAILTO_MAX_LENGTH = 1800;

/** Lien mailto ; null si trop long (proposer le copier-coller à la place). */
export function mailtoLink(to: string, subject: string, body: string): string | null {
  const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return href.length <= MAILTO_MAX_LENGTH ? href : null;
}
