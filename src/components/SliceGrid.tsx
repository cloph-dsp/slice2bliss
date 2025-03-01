import React, { useMemo, useRef, useEffect, useState } from 'react';
import { AudioSlice } from '../services/AudioPlaybackEngine';

interface SliceGridProps {
  slices: AudioSlice[];
  activeSlice: number;
  onSliceClick: (index: number) => void;
}

const SliceGrid: React.FC<SliceGridProps> = ({ slices, activeSlice, onSliceClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOverflowed, setIsOverflowed] = useState(false);
  const [gridDimensions, setGridDimensions] = useState({ columns: 4, size: 80 });
  
  // Calculate optimal grid layout based on container size and slice count
  useEffect(() => {
    if (!containerRef.current) return;
    
    const updateGridLayout = () => {
      const container = containerRef.current;
      if (!container) return;
      
      const { width, height } = container.getBoundingClientRect();
      const count = slices.length;
      
      // Define size ranges with better proportions
      const MIN_BUTTON_SIZE = 56;  // Slightly smaller minimum for more consistency
      const MAX_BUTTON_SIZE = 120; // Reduced maximum for more uniform appearance
      
      // Calculate optimal number of columns based on slice count
      let optimalColumns: number;
      
      // Simplified column count logic for predictability
      if (count <= 4) optimalColumns = 2;
      else if (count <= 9) optimalColumns = 3;
      else if (count <= 16) optimalColumns = 4;
      else if (count <= 25) optimalColumns = 5;
      else if (count <= 36) optimalColumns = 6;
      else if (count <= 64) optimalColumns = 8;
      else optimalColumns = Math.ceil(Math.sqrt(count));
      
      // Calculate gap size - more consistent with slice count
      const gapSize = count <= 25 ? 12 : count <= 64 ? 10 : 8;
      
      // Target size based on slice count - more gradual progression
      let targetSize = 110;
      if (count > 16) targetSize = 100;
      if (count > 36) targetSize = 85;
      if (count > 64) targetSize = 75;
      if (count > 100) targetSize = 65;
      
      // Calculate available space
      const availableWidth = width - 16; // Account for container padding
      
      // Calculate how many columns would fit at target size
      const columnsAtTargetSize = Math.floor((availableWidth + gapSize) / (targetSize + gapSize));
      
      // Choose the smaller of optimal columns and what fits at target size
      const columns = Math.min(optimalColumns, Math.max(2, columnsAtTargetSize));
      
      // Calculate the actual button size based on available space
      const availableSpacePerButton = (availableWidth - (gapSize * (columns - 1))) / columns;
      
      // Calculate rows needed
      const rows = Math.ceil(count / columns);
      
      // Calculate max height per button based on container height
      const availableHeight = height - 16; // Account for container padding
      const maxHeightPerButton = rows > 0 ? (availableHeight - (gapSize * (rows - 1))) / rows : MAX_BUTTON_SIZE;
      
      // Use the smaller dimension to maintain square aspect
      let buttonSize = Math.min(availableSpacePerButton, maxHeightPerButton);
      
      // Apply min/max constraints
      buttonSize = Math.max(MIN_BUTTON_SIZE, Math.min(MAX_BUTTON_SIZE, buttonSize));
      
      // Update grid dimensions
      setGridDimensions({ columns, size: buttonSize });
    };
    
    // Initialize layout
    updateGridLayout();
    
    // Set up resize observer
    const resizeObserver = new ResizeObserver(() => {
      updateGridLayout();
    });
    
    resizeObserver.observe(containerRef.current);
    
    // Clean up
    return () => {
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
      resizeObserver.disconnect();
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
    const gap = Math.min(12, Math.max(8, Math.floor(size * 0.12))); // Adjusted gap ratio
    
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, ${Math.floor(size)}px)`,
      gap: `${gap}px`,
      width: '100%',
      justifyContent: 'center',
      padding: '8px'  // Consistent padding
    };
  }, [gridDimensions]);
  
  // Calculate button style with more consistent font sizing
  const getButtonStyle = (index: number) => {
    const { size } = gridDimensions;
    // More consistent font sizing formula
    const fontSize = Math.max(14, Math.min(18, Math.floor(size / 3.5)));
    
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
      className={`slice-grid-container overflow-y-auto w-full h-full pb-2 px-0 ${isOverflowed ? 'overflowed' : ''}`}
      data-slice-count={slices.length}
    >
      <div style={gridStyle} className="w-full">
        {slices.map((slice, index) => (
          <button
            key={slice.id || `slice-${index}`}
            onClick={() => onSliceClick(index)}
            style={getButtonStyle(index)}
            className={`rounded-lg ${
              activeSlice === index
                ? 'bg-yellow-400 text-black shadow-md shadow-yellow-400/20'
                : 'bg-gray-800 text-white hover:bg-yellow-600 hover:text-white'
            } transition-colors duration-200 flex items-center justify-center font-medium`}
          >
            {index + 1}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SliceGrid;
