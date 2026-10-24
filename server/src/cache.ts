import { createHash } from "node:crypto";

export class LruCache<V> {
  private readonly entries = new Map<string, V>();

  constructor(private readonly capacity: number) {}

  get(key: string): V | undefined {
    const value = this.entries.get(key);
    if (value === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    if (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

export const cacheKey = (parts: readonly string[]): string =>
  createHash("sha256").update(parts.join("\u0000")).digest("hex");
