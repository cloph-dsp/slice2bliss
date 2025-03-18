import React, { useMemo } from 'react';

interface AudioWaveformProps {
  buffer: AudioBuffer;
  color?: string;
  height?: number | string;  // Updated to accept string or number
  width?: number | string;   // Updated to accept string or number
  className?: string;
  lineWidth?: number;
  highQuality?: boolean;
}

const AudioWaveform: React.FC<AudioWaveformProps> = ({ 
  buffer,
  color = '#f7dc6f', // Changed from emerald to yellow shade
  height = 40,
  width = 100,
  className = '',
  lineWidth = 2,
  highQuality = false
}) => {
  // Generate waveform path data from audio buffer
  const waveformPath = useMemo(() => {
    if (!buffer || buffer.length === 0) {
      return '';
    }

    // Get audio data from first channel
    const channelData = buffer.getChannelData(0);
    
    // For performance, we reduce the resolution for longer samples
    const sampleStep = highQuality ? 
      Math.max(1, Math.floor(channelData.length / 1000)) : 
      Math.max(1, Math.floor(channelData.length / 100));
    
    // Calculate points for the waveform
    const dataPoints: number[] = [];
    for (let i = 0; i < channelData.length; i += sampleStep) {
      dataPoints.push(channelData[i]);
    }

    // Handle width and height values
    const svgWidth = typeof width === 'number' ? width : 100;
    const svgHeight = typeof height === 'number' ? height : 40;

    // Normalize data points to fit in height
    const normalizedData = dataPoints.map(point => {
      const normalized = ((point + 1) / 2) * svgHeight;
      return Math.max(0, Math.min(svgHeight, normalized)); // Clamp to valid range
    });

    // Calculate width of each segment
    const segmentWidth = svgWidth / normalizedData.length;
    
    // Generate SVG path
    let path = `M 0,${svgHeight/2}`;
    normalizedData.forEach((point, i) => {
      path += ` L ${i * segmentWidth},${svgHeight - point}`;
    });
    
    return path;
  }, [buffer, height, width, highQuality]);

  if (!buffer || buffer.length === 0) {
    return null;
  }

  // Use numeric values for viewBox calculation
  const viewBoxWidth = typeof width === 'number' ? width : 100;
  const viewBoxHeight = typeof height === 'number' ? height : 40;

  return (
    <svg 
      width={width} 
      height={height} 
      className={className}
      viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      preserveAspectRatio="none"
    >
      <path
        d={waveformPath}
        fill="none"
        stroke={color}
        strokeWidth={lineWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default AudioWaveform;
