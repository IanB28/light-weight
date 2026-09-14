import { createApp } from '../src/app.js';

// Vercel invokes this catch-all serverless function for every /api/* route.
// The same Express instance remains the source used by local dev and start.
export default createApp();
