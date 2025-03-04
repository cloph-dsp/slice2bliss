/**
 * Utility functions for audio analysis
 */

/**
 * Calculate RMS (Root Mean Square) amplitude of an audio buffer
 */
export function calculateRMSAmplitude(buffer: AudioBuffer): number {
  let sum = 0;
  let count = 0;
  
  // Process each channel
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i]; // Square the amplitude
      count++;
    }
  }
  
  // Calculate RMS (square root of average of squared amplitudes)
  return Math.sqrt(sum / count);
}

/**
 * Analyze dynamic range of an audio buffer
 */
export function analyzeDynamicRange(buffer: AudioBuffer): {
  peak: number;
  rms: number;
  crest: number; // Crest factor (peak / rms)
  dynamicRange: number; // in dB
} {
  let peakAmplitude = 0;
  let sumSquared = 0;
  let count = 0;
  
  // Process each channel
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    
    for (let i = 0; i < data.length; i++) {
      const amplitude = Math.abs(data[i]);
      
      // Update peak if this sample is louder
      if (amplitude > peakAmplitude) {
        peakAmplitude = amplitude;
      }
      
      // Add to running sum of squares
      sumSquared += amplitude * amplitude;
      count++;
    }
  }
  
  // Calculate RMS (root mean square) amplitude
  const rms = Math.sqrt(sumSquared / count);
  
  // Calculate crest factor (peak / RMS)
  const crest = peakAmplitude / (rms || 0.000001); // Avoid division by zero
  
  // Calculate dynamic range in dB
  // Use 20*log10 for amplitude (not power) ratio
  const dynamicRange = 20 * Math.log10(peakAmplitude / (rms || 0.000001));
  
  return {
    peak: peakAmplitude,
    rms,
    crest,
    dynamicRange
  };
}

/**
 * Estimate audio type based on dynamic characteristics
 */
export function estimateAudioType(buffer: AudioBuffer): {
  type: 'music' | 'speech' | 'noise' | 'unknown';
  confidence: number;
} {
  // Analyze dynamic range
  const { crest, dynamicRange } = analyzeDynamicRange(buffer);
  
  // Define characteristics for different audio types
  // These thresholds are approximate and can be refined
  
  // Music typically has moderate dynamic range and moderate crest factor
  if (dynamicRange > 8 && dynamicRange < 20 && crest > 3 && crest < 12) {
    return {
      type: 'music',
      confidence: 0.6 + 0.4 * (1 - Math.abs(dynamicRange - 14) / 6) * (1 - Math.abs(crest - 6) / 6)
    };
  }
  
  // Speech typically has high dynamic range and high crest factor
  if (dynamicRange > 15 && crest > 8) {
    return {
      type: 'speech',
      confidence: 0.5 + 0.5 * (Math.min(dynamicRange, 30) - 15) / 15 * Math.min(1, (crest - 8) / 8)
    };
  }
  
  // Noise typically has low dynamic range and low crest factor
  if (dynamicRange < 10 && crest < 5) {
    return {
      type: 'noise',
      confidence: 0.5 + 0.5 * (1 - dynamicRange / 10) * (1 - crest / 5)
    };
  }
  
  // If we can't determine the type confidently
  return {
    type: 'unknown',
    confidence: 0.3
  };
}

/**
 * Suggest BPM range based on audio characteristics
 */
export function suggestBpmRange(buffer: AudioBuffer): {
  minBpm: number;
  maxBpm: number;
  suggestedBpm: number;
} {
  const { type, confidence } = estimateAudioType(buffer);
  
  // Default ranges
  let minBpm = 60;
  let maxBpm = 200;
  let suggestedBpm = 120;
  
  switch (type) {
    case 'music':
      // Most music is between 70-180 BPM
      minBpm = 70;
      maxBpm = 180;
      suggestedBpm = 120;
      break;
      
    case 'speech':
      // Speech typically has rhythm around 80-120 BPM
      minBpm = 80;
      maxBpm = 120;
      suggestedBpm = 100;
      break;
      
    case 'noise':
      // Wider range for noise as it's less predictable
      minBpm = 60;
      maxBpm = 240;
      suggestedBpm = 120;
      break;
      
    default:
      // Use defaults for unknown
      break;
  }
  
  return { minBpm, maxBpm, suggestedBpm };
}

/**
 * Simple BPM estimator as a fallback
 * Uses energy-based onset detection in the time domain
 */
export function estimateBpmFromEnergyOnsets(buffer: AudioBuffer): {
  bpm: number;
  confidence: number;
} {
  try {
    // Convert to mono for analysis
    const monoChannel = new Float32Array(buffer.length);
    const numChannels = buffer.numberOfChannels;
    
    // Mix down all channels to mono
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < buffer.length; i++) {
        monoChannel[i] += channelData[i] / numChannels;
      }
    }
    
    // Parameters
    const sampleRate = buffer.sampleRate;
    const frameSize = 1024;
    const hopSize = frameSize / 2; // 50% overlap
    const numFrames = Math.floor((monoChannel.length - frameSize) / hopSize);
    
    // Calculate energy for each frame
    const energies = new Array(numFrames);
    for (let i = 0; i < numFrames; i++) {
      const frameStart = i * hopSize;
      let energy = 0;
      
      for (let j = 0; j < frameSize; j++) {
        energy += monoChannel[frameStart + j] * monoChannel[frameStart + j];
      }
      
      energies[i] = Math.sqrt(energy / frameSize);
    }
    
    // Find onsets based on energy increases
    const onsets = [];
    for (let i = 1; i < energies.length; i++) {
      if (energies[i] > energies[i-1] * 1.1 && energies[i] > 0.1) {
        onsets.push(i * hopSize / sampleRate);
      }
    }
    
    // Calculate inter-onset intervals
    if (onsets.length < 4) {
      return { bpm: 120, confidence: 0.1 }; // Not enough data
    }
    
    const intervals = [];
    for (let i = 1; i < onsets.length; i++) {
      intervals.push(onsets[i] - onsets[i-1]);
    }
    
    // Find most common interval using a histogram
    const minBpm = 60;
    const maxBpm = 200;
    const minInterval = 60 / maxBpm;
    const maxInterval = 60 / minBpm;
    
    const numBins = 140;
    const histogram = new Array(numBins).fill(0);
    
    for (const interval of intervals) {
      if (interval >= minInterval && interval <= maxInterval) {
        const bin = Math.floor((interval - minInterval) * numBins / (maxInterval - minInterval));
        if (bin >= 0 && bin < numBins) {
          histogram[bin]++;
        }
      }
    }
    
    // Find peak in histogram
    let maxBin = 0;
    let maxVal = histogram[0];
    
    for (let i = 1; i < histogram.length; i++) {
      if (histogram[i] > maxVal) {
        maxVal = histogram[i];
        maxBin = i;
      }
    }
    
    // Convert bin index back to BPM
    const dominantInterval = minInterval + maxBin * (maxInterval - minInterval) / numBins;
    const bpm = Math.round(60 / dominantInterval);
    
    // Calculate confidence based on peak height and consistency
    const confidence = Math.min(1, maxVal / (intervals.length * 0.5));
    
    return {
      bpm: Math.max(minBpm, Math.min(maxBpm, bpm)),
      confidence
    };
  } catch (error) {
    console.error("Error in BPM estimation:", error);
    return { bpm: 120, confidence: 0 };
  }
}
