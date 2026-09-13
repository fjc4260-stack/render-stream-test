# Render Stream Test Clients

A small Playwright test service for opening a test stream in 5 independent browser contexts.

## Render

Deploy this repository as a Docker Web Service. Render will build the Dockerfile.

Set:

- `STREAM_URL` = your test-stream URL
- `CLIENTS` = `5`
- `HEADLESS` = `true`
- `RUN_ON_START` = `true`

The service exposes:

- `/health`
- `/status`

Each client gets an independent Playwright BrowserContext, including separate cookies,
localStorage/sessionStorage, cache and browser session state.

This project intentionally does not implement proxy rotation, fingerprint spoofing,
CAPTCHA bypass, or mechanisms intended to manipulate a platform's public view counter.

## Local

```bash
npm install
npx playwright install chromium
STREAM_URL="https://example.test/stream" npm start
```


## Test profiles

The five clients use separate Playwright BrowserContexts and deliberately different,
ordinary browser configurations (user-agent, viewport, locale, timezone and color scheme)
for diagnostic testing. The service also reports observable browser properties in `/status`.

This is not an anti-bot evasion system: it does not spoof Canvas/WebGL, rotate IPs,
bypass CAPTCHA, or attempt to defeat a platform's identity/anti-fraud controls.


## Free Render memory note

The Free instance has a 512 MB memory limit. Chromium is memory-heavy, so this free-optimized build is intentionally limited to 2 browser clients. If you set CLIENTS higher, the service may be killed by Render for out-of-memory. For 5 simultaneous Chromium clients, use a Render plan with more memory.
