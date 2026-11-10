import { Module, type DynamicModule } from '@nestjs/common';
import { AppConfig, type Env } from './env';

/** Makes the parsed configuration injectable everywhere, by type. */
@Module({})
export class ConfigModule {
  static register(config: Env): DynamicModule {
    return {
      module: ConfigModule,
      global: true,
      providers: [{ provide: AppConfig, useValue: new AppConfig(config) }],
      exports: [AppConfig],
    };
  }
}
