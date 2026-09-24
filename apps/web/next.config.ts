import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // packages/core est consommé en source TypeScript, sans étape de build (ADR-002).
  transpilePackages: ["@jobhunt/core"],
  // En bas à droite : en bas à gauche, l'indicateur masque la bascule de thème de la sidebar.
  devIndicators: { position: "bottom-right" },
  // Pas de clé `webpack` : Next 16 construit avec Turbopack et échoue si elle est présente.
};

export default nextConfig;
