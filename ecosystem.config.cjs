module.exports = {
  apps: [{
    name: 'provenueai',
    script: 'src/index.js',
    cwd: '/var/ProvenueAi/ProvenueAi/server',
    env: {
      PORT: 5178,
      MYSQL_HOST: '127.0.0.1',
      MYSQL_PORT: 3307,
      MYSQL_USER: 'provenue',
      MYSQL_PASSWORD: '7d02bCRZOsep3ALkjFX1vmig',
      MYSQL_DATABASE: 'provenueai',
      JWT_SECRET: 'RNteBk3JE42AuQoU6zyg1bP7aVfxCwLiSThOdIvWr0HnpcqZ',
      ADMIN_EMAIL: 'admin@provenue.ai',
      ADMIN_PASSWORD: 'Provenue@2026',
      NIM_API_KEY: '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',
      NIM_BASE_URL: 'https://integrate.api.nvidia.com/v1',
      SERPER_API_KEY: '',
      NIM_MODEL: 'meta/llama-3.1-8b-instruct'
    }
  }]
};