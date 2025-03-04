import { analyze } from 'web-audio-beat-detector';
import { extractBPM } from '../utils/fileNameUtils';

export const detectBPM = async (audioBuffer: AudioBuffer, fileName: string): Promise<number | null> => {
  const bpmFromFileName = extractBPM(fileName);

  if (bpmFromFileName) {
    return bpmFromFileName;
  }

  try {
    const tempo = await analyze(audioBuffer);
    return tempo;
  } catch (error) {
    console.error('Error detecting BPM:', error);
    return null;
  }
};
