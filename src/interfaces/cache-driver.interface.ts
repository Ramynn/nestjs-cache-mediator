export interface ICacheDriver {
    /**
     * Retrieves the value for the given key.
     */
    get(key: string): Promise<string | null>;

    /**
     * Sets the value for the given key with a TTL in seconds.
     */
    set(key: string, value: string, ttl: number): Promise<void>;

    /**
     * Deletes the given key from cache.
     */
    del(key: string): Promise<void>;
}
