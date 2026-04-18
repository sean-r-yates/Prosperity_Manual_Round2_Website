# Signal Outpost

Signal Outpost is a browser-based allocation scorer built around Research, Scale, and Speed inputs. It keeps submissions tied to a browser-scoped session, tracks result history, and includes a password-protected admin surface with CSV export.

## What It Includes

- One public single-page web app with inspired sci-fi styling
- Browser-scoped sessions that refresh automatically over time
- Research, Scale, and Speed scoring with private result views
- Submission history with charting and duplicate-from-history workflow
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

- Real attempts are stored with session identifiers plus allocation and output fields.
- The scoring reference layer combines generated entries with a deterministic sample of recent real submissions.
- Generated reference data is never written into the real-attempt CSV.

