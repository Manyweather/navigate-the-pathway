# Cloudflare access service

The Cloudflare Worker validates the shared playtest code for the static GitHub Pages application. It exposes only health, unlock, and session-verification routes.

Required encrypted Worker secrets:

- `NAVIGATE_ACCESS_CODE`
- `NAVIGATE_SESSION_SECRET`

The Worker accepts browser requests from `https://manyweather.github.io` and a local preview origin. It returns a signed twelve-hour playtest token. The token grants access only to the fictional browser-local demonstration and is not an institutional identity credential.

No secret values belong in this directory, the Wrangler configuration, GitHub Actions, or application source.
