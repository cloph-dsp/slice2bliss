import React, { useMemo, useRef, useEffect, useState } from 'react';
import { AudioSlice } from '../services/AudioPlaybackEngine';
import AudioWaveform from './AudioWaveform';

interface SliceGridProps {
  slices: AudioSlice[];
  activeSlice: number;
  onSliceClick: (index: number) => void;
}

const SliceGrid: React.FC<SliceGridProps> = ({ slices, activeSlice, onSliceClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOverflowed, setIsOverflowed] = useState(false);
  const [gridDimensions, setGridDimensions] = useState({ columns: 4, size: 80 });
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('landscape');
  
  // Calculate optimal grid layout based on container size and slice count
  useEffect(() => {
    if (!containerRef.current) return;
    
    const updateGridLayout = () => {
      const container = containerRef.current;
      if (!container) return;
      
      const { width, height } = container.getBoundingClientRect();
      const count = slices.length;
      
      // Update orientation state
      setOrientation(width > height ? 'landscape' : 'portrait');
      
      // Define boundaries for sizing
      const MIN_BUTTON_SIZE = Math.max(40, Math.min(52, width / 8));  // Adaptive minimum size
      const MAX_BUTTON_SIZE = Math.min(110, width / 3); // Adaptive maximum size
      
      // Calculate container aspect ratio
      const containerAspectRatio = width / height;
      
      // Dynamic calculation of optimal columns based on count, aspect ratio and space
      let optimalColumns: number;
      
      if (count <= 3) {
        optimalColumns = count; // For small counts, use one row
      } else if (count <= 8) {
        // For small-medium counts, use intuitive layouts
        optimalColumns = containerAspectRatio > 1.5 ? 4 : containerAspectRatio > 1 ? 3 : 2;
      } else {
        // Calculate base columns from square root of count
        const baseColumns = Math.round(Math.sqrt(count));
        
        // Adjust more aggressively based on aspect ratio
        const aspectMultiplier = containerAspectRatio > 1.5 ? 1.4 : // very wide
                               containerAspectRatio > 1 ? 1.2 : // landscape
                               0.8; // portrait
        
        const aspectAdjustedColumns = Math.round(baseColumns * aspectMultiplier);
        
        // For very high counts, adjust columns more precisely
        const densityFactor = count > 100 ? 1.3 : 
                            count > 64 ? 1.2 : 
                            count > 36 ? 1.1 : 1.0;
        
        optimalColumns = Math.max(2, Math.round(aspectAdjustedColumns * densityFactor));
      }
      
      // Calculate adaptive gap size based on slice count, screen size and available space
      const gapSize = width < 480 ? 
                     (count > 32 ? 4 : 6) : // small screens
                     count > 100 ? 6 : 
                     count > 64 ? 8 : 
                     count > 36 ? 10 : 12;
      
      // Calculate available space
      const availableWidth = width - (width < 640 ? 8 : 16); // Less padding on small screens
      
      // Calculate how many columns can fit with minimum size
      const maxPossibleColumns = Math.floor((availableWidth + gapSize) / (MIN_BUTTON_SIZE + gapSize));
      
      // Use whichever is smaller - optimal or maximum possible
      const columns = Math.min(optimalColumns, maxPossibleColumns);
      
      // Calculate the actual button size based on available space
      const availableSpacePerButton = (availableWidth - (gapSize * (columns - 1))) / columns;
      
      // Calculate rows needed
      const rows = Math.ceil(count / columns);
      
      // Calculate max height per button based on available height
      const availableHeight = height - (width < 640 ? 8 : 16);
      const maxHeightPerButton = (availableHeight - (gapSize * (rows - 1))) / rows;
      
      // Use the smaller dimension to maintain square aspect and ensure fitting
      let buttonSize = Math.min(availableSpacePerButton, maxHeightPerButton);
      
      // Apply size constraints
      buttonSize = Math.max(MIN_BUTTON_SIZE, Math.min(MAX_BUTTON_SIZE, buttonSize));
      
      // Apply progressive size reduction for very large counts
      if (count > 100) {
        const reductionFactor = Math.min(0.8, Math.max(0.6, 100 / count));
        buttonSize *= reductionFactor;
      } else if (count > 64) {
        const reductionFactor = Math.min(0.9, Math.max(0.7, 64 / count));
        buttonSize *= reductionFactor;
      }
      
      // Update grid dimensions
      setGridDimensions({ columns, size: Math.floor(buttonSize) });
    };
    
    // Initialize layout
    updateGridLayout();
    
    // Set up resize observer for container size changes
    const resizeObserver = new ResizeObserver(() => {
      updateGridLayout();
    });
    
    resizeObserver.observe(containerRef.current);
    
    // Also listen for window resize events (some mobile browsers need this)
    window.addEventListener('resize', updateGridLayout);
    
    // Handle orientation change specifically for mobile
    window.addEventListener('orientationchange', updateGridLayout);
    
    // Clean up
    return () => {
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateGridLayout);
      window.removeEventListener('orientationchange', updateGridLayout);
    };
  }, [slices.length]);
  
  // Check if content is overflowed
  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current) {
        const { scrollHeight, clientHeight } = containerRef.current;
        setIsOverflowed(scrollHeight > clientHeight + 5); // Add small threshold
      }
    };
    
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    
    return () => {
      window.removeEventListener('resize', checkOverflow);
    };
  }, [slices.length, gridDimensions]);
  
  // Generate grid style based on calculated dimensions
  const gridStyle = useMemo(() => {
    const { columns, size } = gridDimensions;
    
    // Adaptive gap based on button size, but with a floor value
    const gap = Math.max(4, Math.min(12, Math.floor(size * 0.1)));
    
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, ${Math.floor(size)}px)`,
      gap: `${gap}px`,
      width: '100%',
      justifyContent: 'center',
      padding: orientation === 'portrait' && window.innerWidth < 480 ? '4px' : '8px'
    };
  }, [gridDimensions, orientation]);
  
  // Calculate button style with consistent font sizing
  const getButtonStyle = (index: number) => {
    const { size } = gridDimensions;
    
    // Progressive font sizing based on button size
    const fontSize = Math.max(12, Math.min(18, Math.floor(size / 4)));
    
    return {
      width: `${size}px`,
      height: `${size}px`,
      fontSize: `${fontSize}px`,
      fontWeight: 600
    };
  };
  
  return (
    <div 
      ref={containerRef}
      className={`slice-grid-container overflow-y-auto w-full h-full pb-2 px-0 ${isOverflowed ? 'overflowed' : ''} ${orientation}`}
      data-slice-count={slices.length}
      data-orientation={orientation}
    >
      <div style={gridStyle} className="w-full">
        {slices.map((slice, index) => {
          const isActive = activeSlice === index;
          return (
            <button
              key={slice.id || `slice-${index}`}
              onClick={() => onSliceClick(index)}
              style={getButtonStyle(index)}
              className={`
                rounded-lg overflow-hidden relative
                ${isActive 
                  ? 'playing active-slice-animation' 
                  : 'bg-slate-800 hover:bg-slate-700'}
                transition-all duration-200 flex items-center justify-center
              `}
              aria-label={`Slice ${index + 1}`}
              aria-pressed={isActive}
            >
              {/* Waveform background */}
              <div className={`absolute inset-0 flex items-center justify-center opacity-30 ${slices.length > 36 ? 'hidden sm:flex' : ''}`}>
                <AudioWaveform
                  buffer={slice.buffer}
                  color={isActive ? "#ffffff" : "#f7dc6f"}
                  width={Math.max(30, gridDimensions.size - 10)}
                  height={Math.max(15, Math.floor(gridDimensions.size / 2))}
                  className="z-0"
                />
              </div>
              
              {/* Active slice animation overlay */}
              {isActive && (
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-yellow-500 z-0 animate-pulse-subtle"></div>
              )}
              
              {/* Slice number */}
              <span className={`
                relative z-10 font-medium 
                ${isActive ? 'text-black' : 'text-slate-200'}
              `}>
                {index + 1}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SliceGrid;
