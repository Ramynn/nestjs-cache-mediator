export interface CacheJobPayload<P> {
    jobType: string;
    params: P;
    cacheKey: string;
}

export type CacheJobHandler<P, T> = (params: P) => Promise<T>;
