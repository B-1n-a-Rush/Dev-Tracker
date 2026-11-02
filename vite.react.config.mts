import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';

// Support the local outputs/ layout and the repository's flat GitHub Pages layout.
const runtimeRoot = existsSync('index.html') && !existsSync('outputs/index.html') ? '.' : 'outputs';

export default defineConfig({
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: `${runtimeRoot}/react-ui`,
    emptyOutDir: true,
    target: 'es2020',
    lib: {
      entry: 'src/react/shape-export/entry.tsx',
      name: 'TracksideShapeReact',
      formats: ['iife'],
      fileName: () => 'trackside-shape-react.js'
    },
    sourcemap: false,
    minify: true
  }
});
