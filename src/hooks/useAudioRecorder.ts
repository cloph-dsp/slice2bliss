import { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import convertWebmToWav from '../utils/audioConverter';

interface Recording {
  id: string;
  name: string;
  url: string;
  timestamp: number;
  size?: number;
  duration?: number;
  blob: Blob;
}

interface RecordingMetrics {
  peakDb: number;
  rmsDb: number;
  clipCount: number;
}

interface UseAudioRecorderReturn {
  isRecording: boolean;
  recordings: Recording[];
  recordingMetrics: RecordingMetrics;
  startRecording: (stream?: MediaStream) => Promise<void>;
  stopRecording: () => Promise<void>;
  deleteRecording: (id: string) => void;
  currentlyPlaying: string | null;
  playPauseRecording: (id: string) => void;
  downloadRecording: (id: string) => void;
}

const INITIAL_METRICS: RecordingMetrics = {
  peakDb: -96,
  rmsDb: -96,
  clipCount: 0,
};

const useAudioRecorder = (): UseAudioRecorderReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [recordingMetrics, setRecordingMetrics] = useState<RecordingMetrics>(INITIAL_METRICS);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const pendingStopResolverRef = useRef<(() => void) | null>(null);
  const activeUrlsRef = useRef<Set<string>>(new Set());
  const analysisContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.onended = () => setCurrentlyPlaying(null);

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      for (const url of activeUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      activeUrlsRef.current.clear();
      cleanupAnalysis();
    };
  }, []);

  const cleanupAnalysis = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (analysisContextRef.current) {
      analysisContextRef.current.close().catch(() => undefined);
      analysisContextRef.current = null;
    }
    analyserRef.current = null;
  };

  const dbFromLinear = (value: number) => {
    if (value <= 0.000001) return -96;
    return 20 * Math.log10(value);
  };

  const startMetering = async (stream: MediaStream) => {
    cleanupAnalysis();
    const context = new AudioContext();
    analysisContextRef.current = context;
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.7;
    source.connect(analyser);
    analyserRef.current = analyser;

    const buffer = new Float32Array(analyser.fftSize);
    const tick = () => {
      const node = analyserRef.current;
      if (!node) return;

      node.getFloatTimeDomainData(buffer);
      let peak = 0;
      let sumSquares = 0;
      let clipDetected = false;

      for (let i = 0; i < buffer.length; i++) {
        const sample = buffer[i];
        const abs = Math.abs(sample);
        if (abs > peak) peak = abs;
        sumSquares += sample * sample;
        if (abs >= 0.999) clipDetected = true;
      }

      const rms = Math.sqrt(sumSquares / buffer.length);
      setRecordingMetrics((prev) => ({
        peakDb: dbFromLinear(peak),
        rmsDb: dbFromLinear(rms),
        clipCount: prev.clipCount + (clipDetected ? 1 : 0),
      }));

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  const startRecording = useCallback(async (externalStream?: MediaStream) => {
    const stream = externalStream || await navigator.mediaDevices.getUserMedia({ audio: true });
    await startMetering(stream);

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;
    audioChunksRef.current = [];
    setRecordingMetrics(INITIAL_METRICS);

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      try {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const wavBlob = await convertWebmToWav(audioBlob, { bitDepth: 24, channels: 2 });
        const wavUrl = URL.createObjectURL(wavBlob);
        activeUrlsRef.current.add(wavUrl);

        const startedAt = recordingStartedAtRef.current;
        const duration = startedAt ? (Date.now() - startedAt) / 1000 : undefined;

        setRecordings((prev) => [
          ...prev,
          {
            id: uuidv4(),
            name: `Recording ${prev.length + 1}`,
            url: wavUrl,
            timestamp: Date.now(),
            size: wavBlob.size,
            duration,
            blob: wavBlob,
          },
        ]);
      } catch (error) {
        console.error('Error finalizing recording:', error);
      } finally {
        if (!externalStream) {
          stream.getTracks().forEach((track) => track.stop());
        }
        cleanupAnalysis();
        setIsRecording(false);
        recordingStartedAtRef.current = null;
        pendingStopResolverRef.current?.();
        pendingStopResolverRef.current = null;
      }
    };

    recorder.start(100);
    recordingStartedAtRef.current = Date.now();
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    await new Promise<void>((resolve) => {
      pendingStopResolverRef.current = resolve;
      recorder.stop();
    });
  }, []);

  const deleteRecording = useCallback((id: string) => {
    if (currentlyPlaying === id && audioRef.current) {
      audioRef.current.pause();
      setCurrentlyPlaying(null);
    }

    setRecordings((prev) => {
      const target = prev.find((r) => r.id === id);
      if (target) {
        URL.revokeObjectURL(target.url);
        activeUrlsRef.current.delete(target.url);
      }
      return prev.filter((r) => r.id !== id);
    });
  }, [currentlyPlaying]);

  const playPauseRecording = useCallback((id: string) => {
    const recording = recordings.find((rec) => rec.id === id);
    if (!recording) return;

    if (currentlyPlaying === id && audioRef.current) {
      audioRef.current.pause();
      setCurrentlyPlaying(null);
      return;
    }

    if (currentlyPlaying && audioRef.current) {
      audioRef.current.pause();
    }

    if (audioRef.current) {
      audioRef.current.src = recording.url;
      audioRef.current.play()
        .then(() => setCurrentlyPlaying(id))
        .catch((err) => console.error('Error playing audio:', err));
    }
  }, [recordings, currentlyPlaying]);

  const downloadRecording = useCallback((id: string) => {
    const recording = recordings.find((rec) => rec.id === id);
    if (!recording) return;

    const baseFileName = recording.name.replace(/\s+/g, '_').replace(/\.wav$/i, '');
    const downloadName = `${baseFileName}.wav`;

    const url = URL.createObjectURL(recording.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [recordings]);

  return {
    isRecording,
    recordings,
    recordingMetrics,
    startRecording,
    stopRecording,
    deleteRecording,
    currentlyPlaying,
    playPauseRecording,
    downloadRecording,
  };
};

export default useAudioRecorder;

