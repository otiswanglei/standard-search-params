# Basic example

A minimal Vite + React app demonstrating `@standard-search-params/react`,
mixing Zod and Valibot schemas for different keys of the same object.

## Run it

From the repo root, build the package first (the example depends on its
`dist/` output, just like a real consumer would):

```bash
npm run build
```

Then, from this directory:

```bash
npm install
npm run dev
```

Open the printed local URL and click through the example links — each one
is a full page load, so you can see the hook read a fresh URL from scratch.
