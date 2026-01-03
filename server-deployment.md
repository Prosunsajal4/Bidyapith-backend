# Backend Deployment (Vercel)

This backend includes [vercel.json](vercel.json) configured to deploy `index.js` as a serverless function.

## Steps

1. Push the repo to GitHub (or import into Vercel)
2. In Vercel, create a new project and select the `Bidyapith-backend` folder as the root
3. Add Environment Variables in Vercel Project Settings:

- `MONGODB_URI` (recommended)
- `FIREBASE_SERVICE_ACCOUNT_JSON` (recommended)

### Firebase Admin key on Vercel

Vercel functions don't have your local JSON file. Prefer using environment variables instead of a JSON file.

Recommended approach:

- Store the service account JSON contents in an env var (example: `FIREBASE_SERVICE_ACCOUNT_JSON`)
- This backend already supports it (see `.env.example`)

## Verify

- After deploy, hit `GET /ping` on the deployed URL
