import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://logan.github.io',
  base: '/morning-digest',
  trailingSlash: 'never',
  output: 'static',
  integrations: [sitemap()],
  image: {
    remotePatterns: [{ protocol: 'https' }],
  },
});
