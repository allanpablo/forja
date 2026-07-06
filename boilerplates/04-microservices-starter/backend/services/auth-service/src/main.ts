import { startService } from 'shared';
import { AppModule } from './app.module';

const port = parseInt(process.env.PORT || '3001', 10);

startService(AppModule, 'Auth Service', port).catch((error) => {
  console.error('Failed to start Auth Service:', error);
  process.exit(1);
});
