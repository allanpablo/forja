import { startService } from 'shared';
import { AppModule } from './app.module';

const port = parseInt(process.env.PORT || '3003', 10);

startService(AppModule, 'Notification Service', port).catch((error) => {
  console.error('Failed to start Notification Service:', error);
  process.exit(1);
});
