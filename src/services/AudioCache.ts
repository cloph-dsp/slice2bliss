import { AudioSegment } from '../types/audio';

/**
 * LRU Cache for audio segments to optimize memory usage and retrieval speed
 */
export class AudioCache {
  private cache: Map<string, AudioSegment>;
  private maxSize: number;
  private accessOrder: string[];
  
  constructor(maxSize: number = 32) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.accessOrder = [];
  }
  
  /**
   * Get a segment from the cache
   */
  public get(id: string): AudioSegment | undefined {
    const segment = this.cache.get(id);
    
    if (segment) {
      // Update access order (move to end = most recently used)
      this.updateAccessOrder(id);
    }
    
    return segment;
  }
  
  /**
   * Add a segment to the cache
   */
  public set(segment: AudioSegment): void {
    // If cache is full, remove least recently used item
    if (this.cache.size >= this.maxSize && !this.cache.has(segment.id)) {
      this.evictLeastRecentlyUsed();
    }
    
    // Add or update the segment
    this.cache.set(segment.id, segment);
    this.updateAccessOrder(segment.id);
  }
  
  /**
   * Remove a segment from the cache
   */
  public remove(id: string): boolean {
    const removed = this.cache.delete(id);
    
    if (removed) {
      const index = this.accessOrder.indexOf(id);
      if (index !== -1) {
        this.accessOrder.splice(index, 1);
      }
    }
    
    return removed;
  }
  
  /**
   * Clear the entire cache
   */
  public clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }
  
  /**
   * Get all segments in the cache
   */
  public getAll(): AudioSegment[] {
    return Array.from(this.cache.values());
  }
  
  /**
   * Get the number of segments in the cache
   */
  public size(): number {
    return this.cache.size;
  }
  
  /**
   * Update the access order for a segment
   */
  private updateAccessOrder(id: string): void {
    // Remove from current position
    const index = this.accessOrder.indexOf(id);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
    
    // Add to end (most recently used)
    this.accessOrder.push(id);
  }
  
  /**
   * Evict the least recently used segment
   */
  private evictLeastRecentlyUsed(): void {
    if (this.accessOrder.length > 0) {
      const lruId = this.accessOrder.shift()!;
      this.cache.delete(lruId);
      console.log(`Cache: Evicted segment ${lruId} (LRU)`);
    }
  }
}