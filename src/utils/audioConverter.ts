/**
 * Converts a webm blob to a wav blob
 * @param webmBlob
 * @returns wavBlob
 */
async function convertWebmToWav(webmBlob: Blob): Promise<Blob> {
  const audioContext = new AudioContext();
  const arrayBuffer = await webmBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const numberOfChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;

  const offlineAudioContext = new OfflineAudioContext(numberOfChannels, length, sampleRate);
  const offlineAudioBuffer = offlineAudioContext.createBuffer(numberOfChannels, length, sampleRate);

  for (let channel = 0; channel < numberOfChannels; channel++) {
    offlineAudioBuffer.copyToChannel(audioBuffer.getChannelData(channel), channel);
  }

  const source = offlineAudioContext.createBufferSource();
  source.buffer = offlineAudioBuffer;
  source.connect(offlineAudioContext.destination);
  source.start();

  const renderedBuffer = await offlineAudioContext.startRendering();

  const wavData = audioBufferToWavData(renderedBuffer);
  const wavBlob = new Blob([wavData], { type: 'audio/wav' });
  return wavBlob;
}

/**
 * Converts an AudioBuffer to WAV data
 * @param buffer
 * @returns Uint8Array
 */
function audioBufferToWavData(buffer: AudioBuffer): Uint8Array {
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;

  const bytes = new Uint8Array(44 + length * numberOfChannels * 2);
  const view = new DataView(bytes.buffer);

  /* RIFF identifier */
  writeUTFBytes(view, 0, 'RIFF');
  /* RIFF size (depedent on data) */
  view.setUint32(4, 32 + length * numberOfChannels * 2, true);
  /* RIFF format */
  writeUTFBytes(view, 8, 'WAVE');

  /* format chunk identifier */
  writeUTFBytes(view, 12, 'fmt ');
  /* format chunk byte count */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, 1, true);
  /* channel count */
  view.setUint16(22, numberOfChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * numberOfChannels * 2, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, numberOfChannels * 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);

  /* data chunk identifier */
  writeUTFBytes(view, 36, 'data');
  /* data chunk byte count */
  view.setUint32(40, length * numberOfChannels * 2, true);

  floatTo16BitPCM(view, 44, buffer);

  return bytes;
}

/**
 * Writes the sample data
 */
function floatTo16BitPCM(output: DataView, offset: number, input: AudioBuffer) {
  const l = input.length;
  const buf = new ArrayBuffer(l * 2);
  const view = new DataView(buf);
  let s = 0;
  for (let i = 0; i < l; i++, offset += 2) {
    s = Math.max(-1, Math.min(1, input.getChannelData(0)[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  // Converts the ArrayBuffer to a Int16Array
  const PCM = new Int16Array(buf);

  // Iterate over the samples
  for (let i = 0; i < PCM.length; i++) {
    // Writes the .WAV file bytes to the output
    output.setInt16(offset, PCM[i], true);
    offset += 2;
  }
}

/**
 * Helper to write UTF bytes
 */
function writeUTFBytes(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export default convertWebmToWav;
