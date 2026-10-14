import { Module } from '@nestjs/common'

/**
 * The match engine is pure: it holds configuration and exposes functions, so
 * it needs no Nest providers. This module exists so the weights are
 * injectable and testable in one place.
 */
@Module({})
export class MatchingModule {}
