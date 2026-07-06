import { startService } from 'shared';
import { AppModule } from './app.module';

const port = parseInt(process.env.PORT || '3002', 10);

startService(AppModule, 'User Service', port).catch((error) => {
  console.error('Failed to start User Service:', error);
  process.exit(1);
});
