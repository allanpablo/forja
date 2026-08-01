import { Module, type DynamicModule } from '@nestjs/common';
import { ForjaNestModule, type ForjaNestModuleOptions } from './forja-nest.module.ts';

@Module({})
export class AppModule {
  static register(options: ForjaNestModuleOptions): DynamicModule { return { module: AppModule, imports: [ForjaNestModule.register(options)] }; }
}
