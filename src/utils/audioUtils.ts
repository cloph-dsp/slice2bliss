/**
 * Apply short fades to prevent clicks at segment boundaries
 */
export function applyFades(buffer: AudioBuffer, channel: number, fadeDuration: number): void {
  const data = new Float32Array(buffer.length);
  buffer.copyFromChannel(data, channel);

  const fadeSamples = Math.floor(fadeDuration * buffer.sampleRate);

  // Apply fade in
  for (let i = 0; i < Math.min(fadeSamples, data.length / 2); i++) {
    const gain = i / fadeSamples;
    data[i] *= gain;
  }

  // Apply fade out
  for (let i = 0; i < Math.min(fadeSamples, data.length / 2); i++) {
    const gain = i / fadeSamples;
    data[data.length - 1 - i] *= gain;
  }

  buffer.copyToChannel(data, channel);
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
