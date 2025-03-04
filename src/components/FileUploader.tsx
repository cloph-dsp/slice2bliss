import React, { useState, useRef } from 'react';
import { Upload, Music, XCircle } from 'lucide-react';
import { detectBPM } from '../services/BpmDetectionService';

interface FileUploaderProps {
  onFileSelected: (file: File, bpm: number | null) => void;
  accept?: string;
  maxSizeInMB?: number;
}

const FileUploader: React.FC<FileUploaderProps> = ({
  onFileSelected,
  accept = "audio/*",
  maxSizeInMB = 100
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
  
  // Check if we're probably on a touch device (for drag & drop UI)
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };
  
  const validateFile = (file: File): boolean => {
    // Check file size
    if (file.size > maxSizeInBytes) {
      setError(`File is too large. Maximum size is ${maxSizeInMB}MB.`);
      return false;
    }
    
    // Check file type
    if (!file.type.startsWith('audio/')) {
      setError('Only audio files are accepted.');
      return false;
    }
    
    setError(null);
    return true;
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileSelection(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      handleFileSelection(file);
    }
  };

  const handleFileSelection = async (file: File) => {
    if (validateFile(file)) {
      setSelectedFileName(file.name);

      const audioContext = new AudioContext();
      const fileReader = new FileReader();

      fileReader.onload = async (event) => {
        try {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          const bpm = await detectBPM(audioBuffer, file.name);
          onFileSelected(file, bpm);
        } catch (error) {
          console.error('Error decoding audio data or detecting BPM:', error);
          onFileSelected(file, null); // Pass null BPM in case of error
        }
      };

      fileReader.onerror = (error) => {
        console.error('Error reading file:', error);
        setError('Error reading file.');
      };

      fileReader.readAsArrayBuffer(file);
    }
  };
  
  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };
  
  const clearSelection = () => {
    setSelectedFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setError(null);
  };
  
  return (
    <div className="w-full">
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-all
          ${isDragging ? 'border-yellow-400 bg-yellow-400 bg-opacity-10' : 'border-gray-700 hover:border-yellow-500'}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleButtonClick}
        role="button"
        tabIndex={0}
      >
        {selectedFileName ? (
          <div className="flex flex-col items-center">
            <Music className="text-yellow-400 mb-2" size={32} />
            <p className="text-lg font-medium mb-1">{selectedFileName}</p>
            <button 
              className="text-sm text-gray-400 hover:text-red-400 flex items-center gap-1 mt-2"
              onClick={(e) => { e.stopPropagation(); clearSelection(); }}
            >
              <XCircle size={16} /> Remove
            </button>
          </div>
        ) : (
          <>
            <Upload className="mx-auto text-yellow-400 mb-4" size={36} />
            <p className="text-lg font-medium mb-2">
              {isTouchDevice ? 'Tap to select an audio file' : 'Drag & drop or click to select an audio file'}
            </p>
            <p className="text-sm text-gray-400">
              Supported formats: MP3, WAV, OGG, FLAC (max {maxSizeInMB}MB)
            </p>
          </>
        )}
        
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept={accept}
          className="hidden"
        />
      </div>
      
      {error && (
        <div className="mt-2 text-red-500 text-sm p-2 bg-red-500 bg-opacity-10 rounded">
          {error}
        </div>
      )}
    </div>
  );
};

export default FileUploader;
