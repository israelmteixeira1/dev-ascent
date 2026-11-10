import 'reflect-metadata';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { parseEnv } from './config/env';

const config = parseEnv(process.env);
const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config), {
  logger: new ConsoleLogger({ json: true, colors: false }),
});
configureApp(app, config);
app.enableShutdownHooks();
await app.listen(config.port);
