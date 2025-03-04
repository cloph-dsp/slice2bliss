/**
 * Debug utilities for audio processing
 */

/**
 * Wraps method execution with timing and logging
 */
export function withDebugLogging(method: Function, methodName: string, ...args: any[]): Promise<any> {
  try {
    const result = method(...args);
    
    // Handle both Promise and non-Promise returns
    if (result instanceof Promise) {
      return result
        .then(res => {
          return res;
        })
        .catch(err => {
          throw err;
        });
    } else {
      return Promise.resolve(result);
    }
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
 * Logs information about audio buffer
 */
export function logAudioBufferInfo(buffer: AudioBuffer, label: string = 'Audio buffer'): void {
}

/**
 * Get maximum absolute value in audio buffer
 */
function getMaxValue(buffer: AudioBuffer): number {
  let max = 0;
  
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    
    for (let i = 0; i < channelData.length; i++) {
      const absValue = Math.abs(channelData[i]);
      if (absValue > max) {
        max = absValue;
      }
    }
  }
  
  return max;
}

/**
 * Visualize data in console
 */
export function visualizeData(data: number[], label: string, height: number = 10): void {
}
