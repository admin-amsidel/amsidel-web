/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
// The website Worker: serves the built Angular site (static assets) exactly as before, and every 10 minutes wakes the
// backend on Render. Render's free plan puts it to sleep after 15 idle minutes and waking takes up to a minute, which
// would make the first enquiry form or portal sign-in after a quiet spell slow.
const BACKEND_HEALTH = 'https://amsidel-backend.onrender.com/actuator/health';

export default {
  // only reached for requests the static assets do not answer
  fetch(request, env) {
    return env.ASSETS.fetch(request);
  },

  // cron trigger in wrangler.jsonc
  async scheduled(_event, _env, ctx) {
    ctx.waitUntil(fetch(BACKEND_HEALTH).catch(() => undefined));
  },
};
