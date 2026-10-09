import { createApp } from './app.js';
import { getDb } from './db.js';
import { config } from './config.js';

getDb(); // create/migrate the DB on boot
createApp().listen(config.port, () => console.log(`API listening on http://localhost:${config.port}`));
