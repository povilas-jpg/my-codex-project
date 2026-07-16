/**
 * Bounded buffer of recent PTY output so a (re)connecting client can replay
 * the screen. Stores chunks; trims oldest when over capacity.
 */
export class RingBuffer {
  private chunks: string[] = [];
  private total = 0;

  constructor(private readonly capacity: number = 200_000) {}

  push(chunk: string): void {
    this.chunks.push(chunk);
    this.total += chunk.length;
    while (this.total > this.capacity && this.chunks.length > 1) {
      const removed = this.chunks.shift()!;
      this.total -= removed.length;
    }
  }

  snapshot(): string {
    return this.chunks.join("");
  }

  clear(): void {
    this.chunks = [];
    this.total = 0;
  }
}
