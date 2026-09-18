import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // packages/core est consommé en source TypeScript, sans étape de build (ADR-002).
  transpilePackages: ["@jobhunt/core"],
  // Pas de clé `webpack` : Next 16 construit avec Turbopack et échoue si elle est présente.
};

export default nextConfig;
