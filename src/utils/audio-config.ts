// If a file like this exists with fallback configuration:

// With:
export const audioProcessingConfig = {
  // Default sample rate for processing
  sampleRate: 44100,
  
  // Default audio format
  defaultFormat: 'wav',
  
  // Supported file types
  supportedFileTypes: [
    'audio/wav', 
    'audio/x-wav',
    'audio/mp3', 
    'audio/mpeg', 
    'audio/ogg', 
    'audio/flac',
    'audio/aac',
    'audio/m4a',
    'audio/x-m4a'
  ],
  
  // Maximum file size in bytes (50MB)
  maxFileSize: 52428800
};
