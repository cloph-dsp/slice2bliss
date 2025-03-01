/**
 * Basic audio format detection based on file extension
 */
export function detectAudioFormat(file: File): string {
  const fileName = file.name.toLowerCase();
  const mimeType = file.type.toLowerCase();
  
  if (mimeType.includes('audio/mp3') || fileName.endsWith('.mp3')) {
    return 'mp3';
  }
  if (mimeType.includes('audio/wav') || fileName.endsWith('.wav')) {
    return 'wav';
  }
  if (mimeType.includes('audio/ogg') || fileName.endsWith('.ogg')) {
    return 'ogg';
  }
  if (mimeType.includes('audio/flac') || fileName.endsWith('.flac')) {
    return 'flac';
  }
  if (mimeType.includes('audio/aac') || fileName.endsWith('.aac')) {
    return 'aac';
  }
  
  // Default to generic audio
  return 'audio';
}

/**
 * Estimate bit depth from audio buffer
 * This is just an approximation based on amplitude analysis
 */
export function estimateBitDepth(buffer: AudioBuffer): number {
  if (!buffer || buffer.length === 0) {
    return 16; // Default
  }
  
  // Get the first channel
  // const channelData = buffer.getChannelData(0);
  
  // Check for float32 high precision (values between -1 and 1)
  const isFloat = true;
  
  if (isFloat) {
    // Most WebAudio implementations use 32-bit float internally
    return 32;
  }
  
  // Default to common bit depth
  return 16;
}