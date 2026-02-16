export interface WavEncodeOptions {
  bitDepth?: 16 | 24;
  channels?: 1 | 2;
}

const DEFAULT_OPTIONS: Required<WavEncodeOptions> = {
  bitDepth: 24,
  channels: 2,
};

async function convertWebmToWav(webmBlob: Blob, options: WavEncodeOptions = DEFAULT_OPTIONS): Promise<Blob> {
  const opts = { ...DEFAULT_OPTIONS, ...(options || {}) };
  const audioContext = new AudioContext();

  try {
    const arrayBuffer = await webmBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    try {
      const wavData = encodeWavFromAudioBuffer(audioBuffer, opts);
      return new Blob([wavData], { type: 'audio/wav' });
    } catch (error) {
      if (opts.bitDepth === 24) {
        const fallbackData = encodeWavFromAudioBuffer(audioBuffer, { ...opts, bitDepth: 16 });
        return new Blob([fallbackData], { type: 'audio/wav' });
      }
      throw error;
    }
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

export function encodeWavFromAudioBuffer(
  buffer: Pick<AudioBuffer, 'length' | 'numberOfChannels' | 'sampleRate' | 'getChannelData'>,
  options: WavEncodeOptions = DEFAULT_OPTIONS
): Uint8Array {
  const opts = { ...DEFAULT_OPTIONS, ...(options || {}) };
  const sourceChannels = Math.max(1, buffer.numberOfChannels);
  const channelCount = Math.max(1, Math.min(opts.channels, 2));
  const bitDepth = opts.bitDepth === 24 ? 24 : 16;
  const bytesPerSample = bitDepth / 8;
  const sampleCount = buffer.length;
  const dataSize = sampleCount * channelCount * bytesPerSample;
  const totalSize = 44 + dataSize;

  const bytes = new Uint8Array(totalSize);
  const view = new DataView(bytes.buffer);

  writeUtfBytes(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeUtfBytes(view, 8, 'WAVE');
  writeUtfBytes(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  writeUtfBytes(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const channelData: Float32Array[] = [];
  for (let c = 0; c < channelCount; c++) {
    if (c < sourceChannels) {
      channelData.push(buffer.getChannelData(c));
    } else {
      channelData.push(buffer.getChannelData(0));
    }
  }

  let offset = 44;
  for (let i = 0; i < sampleCount; i++) {
    for (let c = 0; c < channelCount; c++) {
      const sample = Math.max(-1, Math.min(1, channelData[c][i] || 0));
      if (bitDepth === 24) {
        const int24 = Math.round(sample * 0x7fffff);
        view.setUint8(offset, int24 & 0xff);
        view.setUint8(offset + 1, (int24 >> 8) & 0xff);
        view.setUint8(offset + 2, (int24 >> 16) & 0xff);
        offset += 3;
      } else {
        const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, int16, true);
        offset += 2;
      }
    }
  }

  return bytes;
}

function writeUtfBytes(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

export default convertWebmToWav;

