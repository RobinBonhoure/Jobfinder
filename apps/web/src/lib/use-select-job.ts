import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * Sélection de l'offre affichée dans le panneau de détail : portée par `?sel=<clusterId>`
 * pour que la fiche reste un Server Component. Conserve les autres paramètres (filtres).
 */
export function useSelectJob() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return useCallback(
    (clusterId: string | null) => {
      const next = new URLSearchParams(params);
      if (clusterId) next.set("sel", clusterId);
      else next.delete("sel");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, params],
  );
}
