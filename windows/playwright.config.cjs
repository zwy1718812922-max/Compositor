const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', testMatch: '**/*.spec.cjs', timeout: 60000,
  workers: 1, reporter: 'list', use: { trace: 'retain-on-failure' }
});
