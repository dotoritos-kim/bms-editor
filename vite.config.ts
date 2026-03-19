import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'three',
        '@react-three/fiber',
        '@react-three/drei',
        'zustand',
        'lucide-react',
        '@rhythm-archive/bms-core',
        '@rhythm-archive/bms-player',
        /^@rhythm-archive\/bms-core\/.*/,
        /^@rhythm-archive\/bms-player\/.*/,
      ],
    },
    sourcemap: true,
    minify: false,
  },
});
