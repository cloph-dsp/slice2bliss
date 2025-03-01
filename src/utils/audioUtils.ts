/**
 * Utilities for audio processing and visualization
 */

/**
 * Generate waveform data from an AudioBuffer
 * @param buffer The audio buffer to analyze
 * @param numPoints Number of data points to generate
 * @returns Array of normalized amplitude values (0-1)
 */
export function generateWaveformData(buffer: AudioBuffer, numPoints: number = 100): number[] {
  const channelData = buffer.getChannelData(0); // Use first channel
  const blockSize = Math.floor(channelData.length / numPoints);
  const waveform: number[] = [];
  
  for (let i = 0; i < numPoints; i++) {
    const startIndex = i * blockSize;
    const endIndex = Math.min(startIndex + blockSize, channelData.length);
    
    // Find max amplitude in this block
    let max = 0;
    for (let j = startIndex; j < endIndex; j++) {
      const abs = Math.abs(channelData[j]);
      if (abs > max) max = abs;
    }
    
    waveform.push(max);
  }
  
  return waveform;
}

/**
 * Generate a color gradient for waveform visualization based on frequency content
 * @param buffer Audio buffer to analyze
 * @returns Color string (hex or rgba)
 */
export function getAudioColorTone(buffer: AudioBuffer): string {
  // Simple implementation - could be enhanced with real frequency analysis
  // Analyze amplitude characteristics to guess audio type
  const channelData = buffer.getChannelData(0);
  
  // Calculate RMS (root mean square) amplitude
  let sum = 0;
  for (let i = 0; i < channelData.length; i++) {
    sum += channelData[i] * channelData[i];
  }
  const rms = Math.sqrt(sum / channelData.length);
  
  // Calculate peak-to-RMS ratio (crest factor)
  let peak = 0;
  for (let i = 0; i < channelData.length; i++) {
    const abs = Math.abs(channelData[i]);
    if (abs > peak) peak = abs;
  }
  const crestFactor = peak / rms;
  
  // Use characteristics to determine color - now all in yellow shades
  // Higher crest factor = more transients/percussive = brighter yellows
  // Lower crest factor = more sustained/tonal = deeper yellows
  
  if (crestFactor > 4) {
    // Very percussive sounds (drums, etc)
    return '#fef08a'; // yellow-200
  } else if (crestFactor > 3) {
    // Moderately percussive
    return '#fde047'; // yellow-300
  } else if (crestFactor > 2) {
    // Balanced sounds
    return '#facc15'; // yellow-400
  } else {
    // Sustained sounds (pads, etc)
    return '#eab308'; // yellow-500
  }
}

/**
 * Apply fade in/out to avoid clicks
 * @param buffer Audio buffer to modify
 * @param fadeInTime Fade in time in seconds
 * @param fadeOutTime Fade out time in seconds
 * @returns Modified buffer with fades applied
 */
export function applyFades(
  buffer: AudioBuffer, 
  fadeInTime: number = 0.01, 
  fadeOutTime: number = 0.01
): AudioBuffer {
  // Convert fade times to samples
  const fadeInSamples = Math.floor(fadeInTime * buffer.sampleRate);
  const fadeOutSamples = Math.floor(fadeOutTime * buffer.sampleRate);
  
  // Apply fades to each channel
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const channelData = buffer.getChannelData(c);
    
    // Apply fade in
    for (let i = 0; i < fadeInSamples && i < channelData.length; i++) {
      const gain = i / fadeInSamples;
      channelData[i] *= gain;
    }
    
    // Apply fade out
    const fadeOutStart = channelData.length - fadeOutSamples;
    for (let i = fadeOutStart; i < channelData.length; i++) {
      const gain = (channelData.length - i) / fadeOutSamples;
      channelData[i] *= gain;
    }
  }
  
  return buffer;
}

/**
 * Calculate interval based on BPM, division, and transition playback rate
 */
export function calculateInterval(bpm: number, division: string, transitionPlaybackRate: number): number {
  const beatsPerSecond = bpm / 60;
  let divisionValue = 1;

  switch (division) {
    case '1/4':
      divisionValue = 1;
      break;
    case '1/8':
      divisionValue = 0.5;
      break;
    case '1/16':
      divisionValue = 0.25;
      break;
    case '1/32':
      divisionValue = 0.125;
      break;
    default:
      divisionValue = 0.25;
  }

  return (divisionValue / beatsPerSecond) * 1000 / transitionPlaybackRate;
}
