import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['shared/**/*.test.js', 'src/**/*.test.js', 'scripts/**/*.test.js'],
  },
})
