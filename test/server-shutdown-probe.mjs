import { bootstrap } from '../apps/server/src/main.ts';

// Port 0: OS assigns a free ephemeral port — this probe never needs to be dialed over HTTP, it
// only proves the SIGINT/SIGTERM handler closes the sqlite handle instead of leaving it open.
await bootstrap(0);
console.log('READY');
