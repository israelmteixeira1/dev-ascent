import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { GithubClient } from './github.client';
import { SessionsService } from './sessions.service';
import { UsersService } from './users.service';

@Module({
  controllers: [AuthController],
  providers: [UsersService, SessionsService, GithubClient],
  exports: [UsersService, SessionsService],
})
export class AuthModule {}
