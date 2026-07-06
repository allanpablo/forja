import { startService } from 'shared';
import { AppModule } from './app.module';

const port = parseInt(process.env.PORT || '3000', 10);

startService(AppModule, 'API Gateway', port).catch((error) => {
  console.error('Failed to start API Gateway:', error);
  process.exit(1);
});
