/**
 * Result of BPM detection
 */
export interface BpmDetectionResult {
  bpm: number;              // Detected BPM
  confidence: number;       // Confidence score (0-1)
  isValid: boolean;         // Whether the detection is considered valid
  details: {                // Additional details for debugging
    onsetCount: number;     // Number of onsets detected (if using audio analysis)
    analysisTime: number;   // Seconds analyzed (if using audio analysis)
    peakThreshold: number;  // Threshold used for peak detection (if using audio analysis)
    rawBpm: number;         // Raw BPM before refinement
    error?: string;         // Error message if detection failed
    source?: string;        // Source of BPM detection (e.g., 'filename', 'analysis')
  };
}

/**
 * Options for BPM detection
 */
export interface BpmDetectionOptions {
  minBpm?: number;          // Minimum BPM to detect
  maxBpm?: number;          // Maximum BPM to detect
  sensitivity?: number;     // Detection sensitivity (0.5-2.0)
  accuracyLevel?: 'low' | 'medium' | 'high';  // Higher accuracy uses more resources
  sampleDuration?: number;  // Maximum seconds to analyze (for performance)
}
