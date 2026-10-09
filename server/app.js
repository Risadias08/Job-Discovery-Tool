import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { config, ROOT } from './config.js';
import { HttpError } from './lib/validate.js';
import meta from './routes/meta.js';
import jobs from './routes/jobs.js';
import applications from './routes/applications.js';
import preferences from './routes/preferences.js';
import geocode from './routes/geocode.js';

export function createApp() {
  const app = express();
  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', meta);
  app.use('/api/jobs', jobs);
  app.use('/api/applications', applications);
  app.use('/api/preferences', preferences);
  app.use('/api/geocode', geocode);

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'not_found', 'Unknown API route')));

  // Production-style run: if the client has been built (npm run build), serve it from the same port.
  const dist = path.join(ROOT, 'client', 'dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html'))); // single-page-app routes
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'invalid_json', message: 'Malformed JSON body' } });
    }
    console.error(err);
    res.status(500).json({ error: { code: 'internal', message: 'Internal server error' } });
  });
  return app;
}
