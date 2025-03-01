import { AudioSegment } from '../types/audio';

/**
 * LRU-like cache for audio segments to improve performance
 * when playing the same segments multiple times
 */
export class AudioCache {
  private segments: Map<string, AudioSegment>;
  private capacity: number;
  private usageOrder: string[];
  
  constructor(capacity = 32) {
    this.segments = new Map<string, AudioSegment>();
    this.capacity = Math.max(1, capacity);
    this.usageOrder = [];
  }
  
  /**
   * Store an audio segment in the cache
   */
  public set(segment: AudioSegment): void {
    // If the segment is already in the cache, remove it from the usage order
    if (this.segments.has(segment.id)) {
      const index = this.usageOrder.indexOf(segment.id);
      if (index >= 0) {
        this.usageOrder.splice(index, 1);
      }
    }
    
    // If we're at capacity, remove the least recently used segment
    if (this.segments.size >= this.capacity && !this.segments.has(segment.id)) {
      const oldestId = this.usageOrder.shift();
      if (oldestId) {
        this.segments.delete(oldestId);
      }
    }
    
    // Add the new segment and update usage order
    this.segments.set(segment.id, segment);
    this.usageOrder.push(segment.id);
  }
  
  /**
   * Retrieve an audio segment from the cache
   */
  public get(id: string): AudioSegment | undefined {
    const segment = this.segments.get(id);
    
    if (segment) {
      // Update usage order (move to end)
      const index = this.usageOrder.indexOf(id);
      if (index >= 0) {
        this.usageOrder.splice(index, 1);
        this.usageOrder.push(id);
      }
    }
    
    return segment;
  }
  
  /**
   * Check if a segment exists in the cache
   */
  public has(id: string): boolean {
    return this.segments.has(id);
  }
  
  /**
   * Remove a specific segment from cache
   */
  public delete(id: string): boolean {
    const index = this.usageOrder.indexOf(id);
    if (index >= 0) {
      this.usageOrder.splice(index, 1);
    }
    return this.segments.delete(id);
  }
  
  /**
   * Clear all segments from the cache
   */
  public clear(): void {
    this.segments.clear();
    this.usageOrder = [];
  }
  
  /**
   * Get the number of segments in the cache
   */
  public get size(): number {
    return this.segments.size;
  }
  
  /**
   * Get the capacity of the cache
   */
  public get maxSize(): number {
    return this.capacity;
  }
}