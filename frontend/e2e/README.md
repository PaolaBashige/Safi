# Browser smoke test

Drives the deployed (or locally previewed) site in headless Chrome: analyze flow, URL tab, Learn, Practice, About,
mobile overflow, error state, and console/network errors.

```bash
npm install --no-save puppeteer-core
SAFI_SITE=https://<your-cloudfront-domain> CHROME_PATH=/path/to/chrome node e2e/e2e.mjs
```
