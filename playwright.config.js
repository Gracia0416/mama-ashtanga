const {defineConfig} = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8000',
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'python3 -m http.server 8000',
    url: 'http://127.0.0.1:8000/book.html',
    reuseExistingServer: true,
  },
  projects: [
    {name: 'mobile', use: {viewport: {width: 390, height: 900}}},
    {name: 'desktop', use: {viewport: {width: 1440, height: 900}}},
  ],
});
