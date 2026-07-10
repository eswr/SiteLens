# Deployment

## Vercel

1. Push the repo to GitHub.
2. Import the repo in Vercel.
3. Framework preset: Vite.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. No environment variables are required for the current demo.

## Notes

- The app uses static GeoJSON files from `public/data`.
- No backend services are required.
- No paid map token is required because the demo uses the public MapLibre demo style.
- The AI summary is deterministic and local.
