import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ICacheDriver } from './interfaces/cache-driver.interface';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { CacheJobPayload, CacheJobHandler } from './interfaces/cache-job.interface';

@Injectable()
export class CacheFirstService {
    private readonly logger = new Logger(CacheFirstService.name);

    // Global in‑memory registry for job handlers: jobType -> handler function.
    private static jobHandlers: Map<string, CacheJobHandler<any, any>> = new Map();

    constructor(
        // The cacheDriver is injected by the consumer.
        private readonly cacheDriver: ICacheDriver,
        @InjectQueue('cacheFirstQueue') private readonly cacheQueue: Queue,
    ) {}

    /**
     * Register a job handler for a given job type.
     * Must be called during module initialization.
     */
    static registerHandler<P, T>(jobType: string, handler: CacheJobHandler<P, T>): void {
        CacheFirstService.jobHandlers.set(jobType, handler);
    }

    /**
     * Get a job handler by job type.
     */
    static getHandler<P, T>(jobType: string): CacheJobHandler<P, T> | undefined {
        return CacheFirstService.jobHandlers.get(jobType);
    }

    /**
     * Generic cache-first method.
     *
     * Steps:
     *   1. Check cache using cacheKey.
     *   2. If missing, schedule a BullMQ job with jobType and params.
     *   3. Wait for job completion (with jobTTL timeout).
     *   4. Cache the result in cacheDriver with redisTTL.
     *
     * @param cacheKey Unique cache key (also used as Bull job id).
     * @param redisTTL TTL (seconds) for caching.
     * @param jobTTL Job timeout in ms.
     * @param jobType Identifier for the job handler.
     * @param params Parameters for the job.
     * @returns Promise<T> with the result.
     */
    async cacheFirst<T, P>(
        cacheKey: string,
        redisTTL: number,
        jobTTL: number,
        jobType: string,
        params: P
    ): Promise<T> {
        // Check cache
        const cached = await this.cacheDriver.get(cacheKey);
        if (cached) {
            try {
                return JSON.parse(cached) as T;
            } catch (err) {
                this.logger.error(`Error parsing cache for key ${cacheKey}`, err);
            }
        }

        // Prepare job payload
        const payload: CacheJobPayload<P> = { jobType, params, cacheKey };

        // Use cacheKey as jobId for uniqueness.
        let bullJob: Job<any> | null;

        bullJob = await this.cacheQueue.getJob(cacheKey);
        if (!bullJob) {
            try {
                bullJob = await this.cacheQueue.add(
                    'cacheFirstJob',
                    payload,
                    { jobId: cacheKey, removeOnComplete: true, timeout: jobTTL }
                );
            } catch (error) {
                bullJob = await this.cacheQueue.getJob(cacheKey);
                if (!bullJob) {
                    throw new InternalServerErrorException('Failed to schedule cache job');
                }
            }
        }

        // Wait for job completion
        let result: T;
        try {
            result = await bullJob.finished() as T;
        } catch (err) {
            this.logger.error(`Job for key ${cacheKey} failed or timed out`, err);
            throw new InternalServerErrorException(`Job timed out after ${jobTTL} ms`);
        }

        // Cache the result
        try {
            await this.cacheDriver.set(cacheKey, JSON.stringify(result), redisTTL);
        } catch (err) {
            this.logger.error(`Error setting cache for key ${cacheKey}`, err);
        }
        return result;
    }

    /**
     * Force refresh of cache for a given key.
     */
    async warmCacheForKey<T, P>(
        cacheKey: string,
        redisTTL: number,
        jobTTL: number,
        jobType: string,
        params: P
    ): Promise<T> {
        await this.cacheDriver.del(cacheKey);
        return this.cacheFirst<T, P>(cacheKey, redisTTL, jobTTL, jobType, params);
    }
}
