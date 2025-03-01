import React from 'react';
import { Upload } from 'lucide-react';

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onFileSelect }) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div className="w-full max-w-4xl flex flex-col items-center justify-center p-8 sm:p-12 border-2 border-dashed border-yellow-500/60 rounded-xl bg-gray-900/30 transition-all hover:border-yellow-400 hover:bg-gray-900/50">
      <Upload className="text-yellow-400 mb-6" size={48} strokeWidth={1.5} />
      <h2 className="text-xl sm:text-2xl font-medium mb-6">Upload an audio file to begin</h2>
      <label className="bg-yellow-400 text-black px-5 py-3 rounded-lg cursor-pointer hover:bg-yellow-300 transition-colors font-medium shadow-lg shadow-yellow-400/10 flex items-center gap-2">
        <Upload size={16} />
        Select File
        <input
          type="file"
          accept="audio/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </label>
    </div>
  );
};

export default FileUploader;
