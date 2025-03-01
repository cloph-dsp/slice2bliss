import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

export interface Recording {
  id: string;
  blob: Blob;
  timestamp: number;
  name: string;
  duration?: number;
  url?: string;
}

export const useAudioRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordingStartTime = useRef<number>(0);

  // Load saved recordings from local storage on mount
  useEffect(() => {
    try {
      const savedRecordings = localStorage.getItem('slice2bliss_recordings');
      if (savedRecordings) {
        const parsed = JSON.parse(savedRecordings);
        
        // Create audio URLs for each recording
        const loadedRecordings = parsed.map((recording: Recording) => {
          const blob = new Blob([new Uint8Array(recording.blob as any)], { type: 'audio/webm' });
          return {
            ...recording,
            blob,
            url: URL.createObjectURL(blob)
          };
        });
        
        setRecordings(loadedRecordings);
      }
    } catch (error) {
      console.error('Failed to load saved recordings:', error);
    }
  }, []);

  // Save recordings to local storage when updated
  useEffect(() => {
    try {
      if (recordings.length > 0) {
        // We need to convert the blobs to array buffers for storage
        const recordingsToSave = recordings.map(async (recording) => {
          const buffer = await recording.blob.arrayBuffer();
          return {
            ...recording,
            blob: Array.from(new Uint8Array(buffer))
          };
        });

        Promise.all(recordingsToSave).then(prepared => {
          localStorage.setItem('slice2bliss_recordings', JSON.stringify(prepared));
        });
      }
    } catch (error) {
      console.error('Failed to save recordings:', error);
    }
  }, [recordings]);

  const startRecording = useCallback((stream: MediaStream): boolean => {
    try {
      console.log("Starting recording with stream:", stream);
      console.log("Stream has audio tracks:", stream.getAudioTracks().length);
      
      if (!stream || stream.getAudioTracks().length === 0) {
        console.error("Stream has no audio tracks");
        return false;
      }
      
      // Test that we can access the stream
      const track = stream.getAudioTracks()[0];
      console.log("Audio track:", track.label, "enabled:", track.enabled);
      
      // Clear current chunks
      setRecordedChunks([]);
      recordingStartTime.current = Date.now();
      
      // Try different mime types if the browser doesn't support the default one
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = '';
        }
      }
      
      console.log("Using MIME type:", mimeType || "browser default");
      
      // Create a media recorder with selected MIME type
      const recorder = mimeType ? 
        new MediaRecorder(stream, { mimeType }) : 
        new MediaRecorder(stream);
      
      // Log recorder state
      console.log("MediaRecorder created with state:", recorder.state);
      
      // Set up event handlers
      recorder.ondataavailable = (event) => {
        console.log("Data available event, size:", event.data.size);
        if (event.data.size > 0) {
          setRecordedChunks(prev => [...prev, event.data]);
        }
      };
      
      recorder.onstart = () => {
        console.log('Recording started, state:', recorder.state);
        setIsRecording(true);
      };
      
      recorder.onstop = () => {
        console.log('Recording stopped');
        setIsRecording(false);
        
        // Combine all chunks into one blob and save the recording
        const chunks = recordedChunks.slice();
        console.log("Processing", chunks.length, "chunks");
        
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { 
            type: mimeType || 'audio/webm' 
          });
          console.log("Created blob, size:", blob.size);
          
          const duration = Date.now() - recordingStartTime.current;
          const id = uuidv4();
          const url = URL.createObjectURL(blob);
          
          const newRecording: Recording = {
            id,
            blob,
            timestamp: recordingStartTime.current,
            name: `Recording ${recordings.length + 1}`,
            duration,
            url
          };
          
          setRecordings(prev => [...prev, newRecording]);
          console.log("Added new recording:", newRecording.name);
        }
      };
      
      recorder.onerror = (err) => {
        console.error('Recording error:', err);
        setIsRecording(false);
      };
      
      // Start recording with smaller time slices to get data more frequently
      recorder.start(500); // Get data every 500ms
      setMediaRecorder(recorder);
      
      return true;
    } catch (error) {
      console.error('Failed to start recording:', error);
      return false;
    }
  }, [recordedChunks, recordings.length]);

  const stopRecording = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      setMediaRecorder(null);
    }
  }, [mediaRecorder]);

  const downloadRecording = useCallback((id: string) => {
    const recording = recordings.find(r => r.id === id);
    if (!recording) {
      console.warn('Recording not found');
      return;
    }
    
    const url = recording.url || URL.createObjectURL(recording.blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `${recording.name.replace(/\s/g, '_')}.webm`;
    
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      if (!recording.url) URL.revokeObjectURL(url);
    }, 100);
  }, [recordings]);
  
  const playPauseRecording = useCallback((id: string) => {
    if (currentlyPlaying === id) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setCurrentlyPlaying(null);
    } else {
      const recording = recordings.find(r => r.id === id);
      if (!recording) return;
      
      if (audioRef.current) {
        audioRef.current.pause();
      }
      
      const audio = new Audio(recording.url || URL.createObjectURL(recording.blob));
      audio.onended = () => {
        setCurrentlyPlaying(null);
        audioRef.current = null;
      };
      audio.play();
      audioRef.current = audio;
      setCurrentlyPlaying(id);
    }
  }, [currentlyPlaying, recordings]);
  
  const deleteRecording = useCallback((id: string) => {
    // Stop if playing
    if (currentlyPlaying === id && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setCurrentlyPlaying(null);
    }
    
    // Remove recording
    setRecordings(prev => {
      const filtered = prev.filter(r => r.id !== id);
      // Update local storage
      try {
        localStorage.setItem('slice2bliss_recordings', JSON.stringify(filtered));
      } catch (error) {
        console.error('Failed to update saved recordings:', error);
      }
      return filtered;
    });
  }, [currentlyPlaying]);

  return {
    isRecording,
    recordedChunks,
    recordings,
    currentlyPlaying,
    startRecording,
    stopRecording,
    downloadRecording,
    playPauseRecording,
    deleteRecording
  };
};
