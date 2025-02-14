import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { CacheJobPayload } from './interfaces/cache-job.interface';
import { CacheFirstService } from './cache-first.service';

@Processor('cacheFirstQueue')
export class CacheFirstProcessor {
    private readonly logger = new Logger(CacheFirstProcessor.name);

    @Process('cacheFirstJob')
    async handleCacheFirstJob(job: Job<CacheJobPayload<any>>): Promise<any> {
        const { jobType, params, cacheKey } = job.data;
        const handler = CacheFirstService.getHandler(jobType);
        if (!handler) {
            throw new Error(`No handler registered for job type: ${jobType}`);
        }
        try {
            const result = await handler(params);
            this.logger.log(`Job for key ${cacheKey} executed successfully.`);
            return result;
        } catch (err) {
            this.logger.error(`Error executing job for key ${cacheKey}`, err);
            throw err;
        }
    }
}
