import type { NextConfig } from 'next';

const config: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },
};

export default config;
