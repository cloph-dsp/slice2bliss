import { AudioFormat } from '../types/audio';

/**
 * Detects audio format from file extension or MIME type
 */
export function detectAudioFormat(file: File): AudioFormat {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const mimeType = file.type.toLowerCase();
  
  if (extension === 'wav' || mimeType.includes('wav') || mimeType.includes('wave')) {
    return 'wav';
  } else if (extension === 'mp3' || mimeType.includes('mp3')) {
    return 'mp3';
  } else if (extension === 'ogg' || mimeType.includes('ogg')) {
    return 'ogg';
  } else if (extension === 'aac' || mimeType.includes('aac')) {
    return 'aac';
  } else if (extension === 'flac' || mimeType.includes('flac')) {
    return 'flac';
  }
  
  return 'unknown';
}

/**
 * Estimates bit depth based on audio buffer data
 */
export function estimateBitDepth(audioBuffer: AudioBuffer): number {
  // Get a sample of audio data
  const channel = audioBuffer.getChannelData(0);
  const sampleSize = Math.min(10000, channel.length);
  
  // Analyze the precision of the values
  let maxPrecision = 0;
  
  for (let i = 0; i < sampleSize; i++) {
    const value = channel[i];
    const valueStr = value.toString();
    
    // Find decimal part
    if (valueStr.includes('.')) {
      const decimalPart = valueStr.split('.')[1];
      maxPrecision = Math.max(maxPrecision, decimalPart.length);
    }
  }
  
  // Estimate bit depth based on precision
  if (maxPrecision <= 2) return 8;
  if (maxPrecision <= 4) return 16;
  if (maxPrecision <= 6) return 24;
  return 32;
}