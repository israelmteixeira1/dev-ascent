import { Module } from '@nestjs/common';
import { JudgeService } from './judge.service';

/** Runs Python solutions. The arena is its only user. */
@Module({ providers: [JudgeService], exports: [JudgeService] })
export class JudgeModule {}
