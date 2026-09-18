# ADR-007 — TypeScript 7 + Biome (pas de typescript-eslint)

**Statut** : accepté — 2026-09-17

## Contexte

`typescript` `latest` = **7.0.2**, le compilateur réécrit en Go. Constats vérifiés :

- TS 7.0 **ne livre pas l'API JavaScript** (`lib/typescript.js`). Elle est annoncée pour la 7.1.
- Tous les outils qui importent `typescript` comme bibliothèque sont donc cassés : **typescript-eslint** en premier, ainsi que ts-morph et ts-jest.
- Microsoft publie `@typescript/typescript6` (6.0.2) comme béquille pour une installation côte à côte.
- **Next.js 16.3** invoque désormais le **CLI `tsc` local** pour la vérification de types (option introduite comme `experimental.useTypeScriptCli`, activée par défaut selon l'annonce de Tim Neutkens et des articles tiers). Next fonctionnerait donc avec TS 7 `[À VÉRIFIER au J1 : lu dans l'annonce, pas testé]`.
- Le guide de migration Next 16 exige TypeScript ≥ 5.1.
- Nos autres outils ne dépendent pas de l'API TS : `tsx` (esbuild), Vitest 5, drizzle-kit, Biome.

## Options

1. **TS 6.0.3 (N-1) + ESLint/typescript-eslint**. Chaîne éprouvée, mais on renonce à la version courante et on ajoute ESLint + plugins pour un projet solo.
2. **TS 7.0.2 + typescript-eslint via `@typescript/typescript6`**. Deux compilateurs installés, une configuration fragile.
3. **TS 7.0.2 + Biome 2.5.14** pour le lint et le format. Biome n'utilise pas l'API TypeScript et remplace à la fois ESLint et Prettier.

## Décision

**Option 3.**

- `typescript@7.0.2` sert uniquement pour `tsc --noEmit` (typecheck) et pour Next.
- `@biomejs/biome@2.5.14` pour `lint` + `format`.
- `strict: true`, `noUncheckedIndexedAccess: true`, `verbatimModuleSyntax: true`.

**Repli** (à appliquer sans débat si un outil casse) : `typescript@6.0.3`. Il suffit de changer la version, le code reste identique.

## Conséquences

- Pas de règles de lint typées, comme `no-floating-promises`. Compensation : `tsc` strict, et des tests sur `core`.
- Le typecheck sera rapide (gain annoncé ×8 à ×12). Ce n'est pas un critère de choix, mais c'est bienvenu.
- À vérifier au J1 : `next build` passe avec TS 7 dans ce monorepo (`transpilePackages`). En cas d'échec → repli TS 6.
- Signal de révision : TS 7.1 publié avec l'API JS → réévaluer typescript-eslint si un besoin de règles typées apparaît.
