import { defineConfig } from 'vite';

export default defineConfig({
  // ↓ ここに '/リポジトリ名/' を指定します (前後のスラッシュを忘れずに)
  base: '/shadow-simulator/', 
  build: {
    outDir: 'dist'
  }
});