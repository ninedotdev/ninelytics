// Empty — Tailwind v4 is wired through the @tailwindcss/vite plugin in
// vite.config.ts, not through PostCSS. We still need this file so Vite
// doesn't walk up the tree and pick up the root (Next-era) postcss config.
export default { plugins: [] }
