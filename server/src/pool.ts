export class PoolFull extends Error {
  constructor() {
    super("The checker queue is full");
  }
}

type Waiter = { resolve: () => void };

export class Pool {
  private active = 0;
  private readonly waiting: Waiter[] = [];

  constructor(
    private readonly concurrency: number,
    private readonly queueLimit: number,
  ) {}

  get running(): number {
    return this.active;
  }

  get queued(): number {
    return this.waiting.length;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active++;
      return Promise.resolve();
    }
    if (this.waiting.length >= this.queueLimit) return Promise.reject(new PoolFull());
    return new Promise((resolve) => this.waiting.push({ resolve }));
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) next.resolve();
    else this.active--;
  }
}
