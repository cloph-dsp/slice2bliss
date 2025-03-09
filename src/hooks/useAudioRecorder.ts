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

interface UseAudioRecorderReturn {
  isRecording: boolean;
  recordings: Recording[];
  startRecording: (stream?: MediaStream) => Promise<void>;
  stopRecording: () => void;
  deleteRecording: (id: string) => void;
  currentlyPlaying: string | null;
  playPauseRecording: (id: string) => void;
  downloadRecording: (id: string) => void;
}

const useAudioRecorder = (): UseAudioRecorderReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.onended = () => setCurrentlyPlaying(null);

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);

  const startRecording = useCallback(async (externalStream?: MediaStream) => {
    try {
      // Use provided stream or get microphone stream as fallback
      const stream = externalStream || await navigator.mediaDevices.getUserMedia({ audio: true });

      // Create AudioContext
      audioContextRef.current = new AudioContext();

      // Create MediaRecorder with WAV format
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      // Reset audio chunks
      audioChunksRef.current = [];

      // Save chunks of audio data as they become available
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      // Handle recording completion
      mediaRecorderRef.current.onstop = async () => {
        // Create a blob from all audio chunks
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);

        // Convert webm to wav
        const wavBlob = await convertWebmToWav(audioBlob);
        const wavUrl = URL.createObjectURL(wavBlob);

        // Calculate duration if startTimeRef was set
        const duration = startTimeRef.current
          ? (Date.now() - startTimeRef.current) / 1000
          : undefined;

        console.log(`Recording completed. Duration: ${duration?.toFixed(2)}s, size: ${(audioBlob.size / 1024).toFixed(2)} KB`);

        // Create recording entry
        const newRecording: Recording = {
          id: uuidv4(),
          name: `Recording ${recordings.length + 1}`,
          url: wavUrl,
          timestamp: Date.now(),
          size: wavBlob.size,
          duration,
          blob: wavBlob
        };

        // Add to recordings list
        setRecordings(prev => [...prev, newRecording]);

        // Stop all tracks on the stream if it was from microphone (not from app audio)
        if (!externalStream) {
          stream.getTracks().forEach(track => track.stop());
        }
      };

      // Start recording and track the start time precisely
      mediaRecorderRef.current.start();
      startTimeRef.current = Date.now();
      setIsRecording(true);
    } catch (error) {
      console.error("Error starting recording:", error);
      throw error; // Re-throw to allow caller to catch errors
    }
  }, [recordings.length]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      startTimeRef.current = null;
    }
  }, []);

  const deleteRecording = useCallback((id: string) => {
    // If deleting currently playing recording, stop playback
    if (currentlyPlaying === id && audioRef.current) {
      audioRef.current.pause();
      setCurrentlyPlaying(null);
    }

    // Filter out recording with matching ID
    setRecordings(prev => prev.filter(rec => rec.id !== id));
  }, [currentlyPlaying]);

  const playPauseRecording = useCallback((id: string) => {
    const recording = recordings.find(rec => rec.id === id);

    if (!recording) return;

    // If already playing this recording, pause it
    if (currentlyPlaying === id && audioRef.current) {
      audioRef.current.pause();
      setCurrentlyPlaying(null);
      return;
    }

    // If playing another recording, stop it first
    if (currentlyPlaying && audioRef.current) {
      audioRef.current.pause();
    }

    // Play the selected recording
    if (audioRef.current) {
      audioRef.current.src = recording.url;
      audioRef.current.play()
        .then(() => setCurrentlyPlaying(id))
        .catch(err => console.error("Error playing audio:", err));
    }
  }, [recordings, currentlyPlaying]);

  const downloadRecording = useCallback((id: string) => {
    const recording = recordings.find(rec => rec.id === id);
    if (!recording) {
      console.error("Recording not found:", id);
      return;
    }

    // Get the blob from the recording
    const blob = recording.blob;

    // Create clean base filename (remove existing extensions)
    const baseFileName = recording.name.replace(/\s+/g, '_').replace(/\.webm|wav$/i, '');

    // Create appropriate extension - always WAV
    const extension = '.wav';

    // Create and trigger download
    const downloadName = `${baseFileName}${extension}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

  }, [recordings]);

  return {
    isRecording,
    recordings,
    startRecording,
    stopRecording,
    deleteRecording,
    currentlyPlaying,
    playPauseRecording,
    downloadRecording,
  };
};

export default useAudioRecorder;
