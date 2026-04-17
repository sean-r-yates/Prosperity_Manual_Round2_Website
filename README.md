# Signal Outpost

Signal Outpost is a single-page strategy sandbox inspired by a manual trading challenge format. It gives each browser an anonymous participant ID, limits attempts, logs every real attempt, mixes real behaviour into a fake market field, and exposes a password-protected admin surface with CSV export.

## What It Includes

- One public single-page web app with inspired sci-fi styling
- Anonymous participant IDs that expire after 3 days
- Exact Research, Scale, and rank-based Speed math from the challenge prompt
- 20 base attempts plus an optional 5-attempt extension
- Real attempt logging only
- Fake market state that refreshes on visit after 20 minutes
- Private per-user results with percentile, rank, expected return, and bullish/base/adverse scenarios
- Personal PnL history graph and duplicate-from-history workflow
- Password-protected admin view with histograms and CSV export

## Storage Choice

This version is designed for Vercel plus Vercel KV or Upstash Redis using the REST API. That keeps the app dependency-light and works cleanly with Vercel serverless functions.

Required environment variables:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `ADMIN_PASSWORD`
- `SESSION_SECRET` (recommended)

You can place these values in `.env.local` for local development and in your Vercel project environment variables for deployment.

## Deploying To Vercel

1. Create a Vercel project from this folder or connect the repo in the Vercel dashboard.
2. Add a Vercel KV database or an Upstash Redis database and copy its REST URL and token into the environment variables above.
3. Set `ADMIN_PASSWORD` and `SESSION_SECRET`.
4. Deploy.

Because the app is built as static pages plus serverless API functions, no framework-specific runtime setup is required beyond the environment variables.

## Data Notes

- Real attempts are stored with anonymous participant IDs and allocation/output fields only.
- The mixed market uses current fake participants plus a deterministic half-sample of latest real submissions.
- Fake data is never written into the real-attempt CSV.

