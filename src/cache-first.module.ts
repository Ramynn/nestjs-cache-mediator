import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { CacheFirstService } from './cache-first.service';
import { CacheFirstProcessor } from './cache-first.processor';

@Global()
@Module({
    imports: [
        BullModule.registerQueue({
            name: 'cacheFirstQueue',
        }),
    ],
    providers: [CacheFirstService, CacheFirstProcessor],
    exports: [CacheFirstService],
})
export class CacheFirstModule {}
