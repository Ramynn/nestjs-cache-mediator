# nestjs-cache-mediator

[![npm version](https://badge.fury.io/js/nestjs-cache-mediator.svg)](https://badge.fury.io/js/nestjs-cache-mediator)  
[![Build Status](https://github.com/Ramynn/nestjs-cache-mediator/workflows/Publish/badge.svg)](https://github.com/Ramynn/nestjs-cache-mediator/actions)

**nestjs-cache-mediator** is a highly abstract, type‑safe NestJS module that implements a cache‑first strategy using [BullMQ](https://docs.nestjs.com/techniques/queues) for distributed job scheduling and a pluggable cache driver (via an interface) for storing results (e.g. in Redis). This package is designed to optimize performance and concurrency by ensuring that multiple concurrent requests for the same cache key share the same job.

## Features

- **Abstract & Generic API:**  
  Define your own job handlers with full TypeScript support and plug them into the cache‑first workflow.

- **BullMQ Integration:**  
  Uses BullMQ to schedule and execute expensive data retrieval tasks, using the cache key as a unique job identifier to prevent duplicate work.

- **Pluggable Cache Driver:**  
  Implements an `ICacheDriver` interface so you can easily use any cache system (e.g. Redis via ioredis).

- **Warm-Up Support:**  
  Provides a method to force a cache refresh (for instance, on application boot).

- **Optimized for Concurrency:**  
  Designed for distributed environments where multiple instances share the same Redis/BullMQ configuration, so duplicate work is avoided.

## Installation

Install the package via npm:

```bash
npm install nestjs-cache-mediator
```

## Setup

### Provide a Cache Driver

Implement the `ICacheDriver` interface to integrate your chosen cache (e.g. Redis). For example, using ioredis:

```ts
// redis-cache-driver.ts
import { ICacheDriver } from 'nestjs-cache-mediator';
import * as Redis from 'ioredis';

export class RedisCacheDriver implements ICacheDriver {
  private client: Redis.Redis;
  constructor(options?: Redis.RedisOptions) {
    this.client = new Redis(options);
  }
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }
  async set(key: string, value: string, ttl: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttl);
  }
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }
}
```

### Module Integration

In your NestJS application's module, import `CacheFirstModule` and provide your cache driver:

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { CacheFirstModule, ICacheDriver } from 'nestjs-cache-mediator';
import { RedisCacheDriver } from './redis-cache-driver';

@Module({
  imports: [CacheFirstModule],
  providers: [
    {
      provide: ICacheDriver,
      useValue: new RedisCacheDriver({ host: 'localhost', port: 6379 }),
    },
  ],
})
export class AppModule {}
```

## Usage

### Register a Job Handler

Register your job handler for a given job type. This should be done early (for example, in a bootstrap function or in the module's initialization):

```ts
import { CacheFirstService } from 'nestjs-cache-mediator';

interface SomeDataType {
  foo: string;
  bar: number;
}

CacheFirstService.registerHandler<{ extraParam: string }, SomeDataType>(
  'getSomeData',
  async (params) => {
    // Implement your data retrieval logic here.
    return { foo: `Hello ${params.extraParam}`, bar: 42 };
  }
);
```

### Use the Cache-First Service

Inject the `CacheFirstService` into your own service and call its generic method:

```ts
import { Injectable } from '@nestjs/common';
import { CacheFirstService } from 'nestjs-cache-mediator';

@Injectable()
export class MyDataService {
  constructor(private readonly cacheFirstService: CacheFirstService) {}

  async getData(extraParam: string): Promise<{ foo: string; bar: number }> {
    const cacheKey = `myData:getSomeData:${extraParam}`;
    return this.cacheFirstService.cacheFirst<{ foo: string; bar: number }, { extraParam: string }>(
      cacheKey,
      3600,  // Redis TTL: 1 hour
      10000, // Job TTL: 10 seconds
      'getSomeData',
      { extraParam }
    );
  }
}
```

### Warm Up the Cache

You can force a refresh (warm-up) of a cache key during application boot or on demand:

```ts
await this.cacheFirstService.warmCacheForKey<{ foo: string; bar: number }, { extraParam: string }>(
  'myData:getSomeData:example',
  3600,  // 1 hour
  10000, // 10 seconds
  'getSomeData',
  { extraParam: 'example' }
);
```

## API Reference

### CacheFirstService Methods

- **`cacheFirst<T, P>(cacheKey: string, redisTTL: number, jobTTL: number, jobType: string, params: P): Promise<T>`**  
  Retrieves data using a cache-first strategy.
    - **cacheKey:** A unique cache key (also used as the Bull job id).
    - **redisTTL:** Time-to-live in seconds for the cached data.
    - **jobTTL:** Maximum wait time (in milliseconds) for the job to complete.
    - **jobType:** Identifier for the job handler.
    - **params:** Parameters passed to the job handler.

- **`warmCacheForKey<T, P>(cacheKey: string, redisTTL: number, jobTTL: number, jobType: string, params: P): Promise<T>`**  
  Forces a refresh of the cache by deleting any existing entry and scheduling a new job.

### Job Handler Registration

- **`CacheFirstService.registerHandler<P, T>(jobType: string, handler: CacheJobHandler<P, T>): void`**  
  Register a function that will be used to fetch data when a cache miss occurs.

### BullMQ Processor

The processor automatically executes jobs added to the `cacheFirstQueue` by calling the registered handler for the job type.

## Contributing

Contributions, improvements, and bug fixes are welcome. Please open an issue or submit a pull request on GitHub.

## License

This project is licensed under the MIT License.