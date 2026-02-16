import { StretchMode } from '../types/audio';

export interface TimeStretchOptions {
  timeRatio: number;
  preservePitch: boolean;
  quality: 'low' | 'medium' | 'high';
}

interface StretchCacheEntry {
  key: string;
  buffer: AudioBuffer;
}

export class TimeStretcher {
  private audioContext: AudioContext;
  private grainSize = 2048;
  private hqBufferCache = new Map<string, StretchCacheEntry>();
  private hqProcessingPromises = new Map<string, Promise<AudioBuffer>>();

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  public setQuality(quality: 'low' | 'medium' | 'high'): void {
    if (quality === 'low') this.grainSize = 1024;
    else if (quality === 'medium') this.grainSize = 2048;
    else this.grainSize = 4096;
  }

  public resolveStretchMode(
    requestedMode: StretchMode,
    playbackRate: number
  ): StretchMode {
    const clamped = Math.max(0.5, Math.min(2, playbackRate));
    if (requestedMode !== 'auto') return requestedMode;
    if (Math.abs(clamped - 1.0) < 0.001) return 'native';
    if (clamped >= 0.85 && clamped <= 1.15) return 'native';
    return 'hq';
  }

  public createNativeSource(
    buffer: AudioBuffer,
    playbackRate: number,
    preservePitch: boolean = true
  ): AudioBufferSourceNode {
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    const safeRate = Math.max(0.5, Math.min(2, playbackRate));
    source.playbackRate.value = safeRate;

    if (preservePitch && 'preservesPitch' in source) {
      (source as any).preservesPitch = true;
    }

    return source;
  }

  public async getHQBuffer(
    sliceKey: string,
    buffer: AudioBuffer,
    playbackRate: number,
    quality: 'low' | 'medium' | 'high'
  ): Promise<AudioBuffer> {
    const safeRate = Math.max(0.5, Math.min(2, playbackRate));
    const cacheKey = `${sliceKey}:${quality}:${safeRate.toFixed(3)}`;
    const cached = this.hqBufferCache.get(cacheKey);
    if (cached) return cached.buffer;

    const pending = this.hqProcessingPromises.get(cacheKey);
    if (pending) return pending;

    this.setQuality(quality);
    const promise = this.processBuffer(buffer, {
      timeRatio: safeRate,
      preservePitch: true,
      quality,
    }).then((processed) => {
      this.hqBufferCache.set(cacheKey, { key: cacheKey, buffer: processed });
      this.hqProcessingPromises.delete(cacheKey);
      // Keep cache bounded.
      if (this.hqBufferCache.size > 256) {
        const first = this.hqBufferCache.keys().next().value;
        if (typeof first === 'string') {
          this.hqBufferCache.delete(first);
        }
      }
      return processed;
    }).catch((error) => {
      this.hqProcessingPromises.delete(cacheKey);
      throw error;
    });

    this.hqProcessingPromises.set(cacheKey, promise);
    return promise;
  }

  public getCacheStats(): {
    cacheSize: number;
    inFlight: number;
  } {
    return {
      cacheSize: this.hqBufferCache.size,
      inFlight: this.hqProcessingPromises.size,
    };
  }

  public processBuffer(
    buffer: AudioBuffer,
    options: TimeStretchOptions
  ): Promise<AudioBuffer> {
    if (!options.preservePitch || Math.abs(options.timeRatio - 1.0) < 0.01) {
      return Promise.resolve(buffer);
    }

    return new Promise((resolve, reject) => {
      try {
        const outputLength = Math.max(1, Math.floor(buffer.length / options.timeRatio));
        const outputBuffer = this.audioContext.createBuffer(
          buffer.numberOfChannels,
          outputLength,
          buffer.sampleRate
        );

        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          this.stretchChannel(
            buffer.getChannelData(channel),
            outputBuffer.getChannelData(channel),
            options.timeRatio
          );
        }

        resolve(outputBuffer);
      } catch (error) {
        reject(error);
      }
    });
  }

  private stretchChannel(
    inputData: Float32Array,
    outputData: Float32Array,
    timeRatio: number
  ): void {
    const grainSize = this.grainSize;
    const overlap = 0.5;
    const hopSize = Math.floor(grainSize * (1 - overlap));
    const window = this.createHannWindow(grainSize);
    const windowSums = new Float32Array(outputData.length);

    outputData.fill(0);
    windowSums.fill(0);

    for (let grainIndex = 0; grainIndex < inputData.length - grainSize; grainIndex += hopSize) {
      const outputIndex = Math.floor(grainIndex / timeRatio);
      if (outputIndex >= outputData.length - grainSize) break;

      for (let i = 0; i < grainSize; i++) {
        if (grainIndex + i < inputData.length && outputIndex + i < outputData.length) {
          const w = window[i];
          const outPos = outputIndex + i;
          outputData[outPos] += inputData[grainIndex + i] * w;
          windowSums[outPos] += w;
        }
      }
    }

    // Normalize by accumulated window energy to reduce combing/dulling artifacts.
    for (let i = 0; i < outputData.length; i++) {
      const weight = windowSums[i];
      if (weight > 1e-6) {
        outputData[i] /= weight;
      }
    }

    const maxValue = this.findMaxAbsValue(outputData);
    if (maxValue > 0.95) {
      const normFactor = 0.95 / maxValue;
      for (let i = 0; i < outputData.length; i++) {
        outputData[i] *= normFactor;
      }
    }
  }

  private createHannWindow(size: number): Float32Array {
    const window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / Math.max(1, size - 1)));
    }
    return window;
  }

  private findMaxAbsValue(arr: Float32Array): number {
    let max = 0;
    for (let i = 0; i < arr.length; i++) {
      max = Math.max(max, Math.abs(arr[i]));
    }
    return max;
  }
}

let timeStretcher: TimeStretcher | null = null;

export function getTimeStretcher(audioContext: AudioContext): TimeStretcher {
  if (!timeStretcher || !(timeStretcher instanceof TimeStretcher)) {
    timeStretcher = new TimeStretcher(audioContext);
  }
  return timeStretcher;
}
