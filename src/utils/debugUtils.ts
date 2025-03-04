/**
 * Debug utilities for audio processing
 */

/**
 * Wraps method execution with timing and logging
 */
export function withDebugLogging(method: Function, methodName: string, ...args: any[]): Promise<any> {
  console.log(`${methodName} started with:`, ...args);
  console.time(`${methodName} execution time`);
  
  try {
    const result = method(...args);
    
    // Handle both Promise and non-Promise returns
    if (result instanceof Promise) {
      return result
        .then(res => {
          console.timeEnd(`${methodName} execution time`);
          console.log(`${methodName} completed successfully:`, res);
          return res;
        })
        .catch(err => {
          console.timeEnd(`${methodName} execution time`);
          console.error(`${methodName} failed:`, err);
          throw err;
        });
    } else {
      console.timeEnd(`${methodName} execution time`);
      console.log(`${methodName} completed successfully:`, result);
      return Promise.resolve(result);
    }
  } catch (error) {
    console.timeEnd(`${methodName} execution time`);
    console.error(`${methodName} failed with synchronous error:`, error);
    return Promise.reject(error);
  }
}

/**
 * Logs information about audio buffer
 */
export function logAudioBufferInfo(buffer: AudioBuffer, label: string = 'Audio buffer'): void {
  console.log(`${label} info:`, {
    sampleRate: buffer.sampleRate,
    lengthSeconds: buffer.duration.toFixed(2),
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    maxChannelValue: getMaxValue(buffer)
  });
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
  console.log(`${label} visualization:`);
  
  const max = Math.max(...data);
  const normalized = data.map(v => v / max * height);
  
  let output = '';
  for (let i = height; i > 0; i--) {
    let row = '';
    for (const val of normalized) {
      row += val >= i ? '█' : ' ';
    }
    output += row + '\n';
  }
  
  console.log(output);
}
