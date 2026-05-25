import React from 'react';

interface LogoProps {
  variant?: 'full' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const Logo: React.FC<LogoProps> = ({ 
  variant = 'full', 
  size = 'md',
  className = '' 
}) => {
  const sizeMap = {
    sm: variant === 'full' ? { width: 80, height: 27 } : { width: 24, height: 24 },
    md: variant === 'full' ? { width: 120, height: 40 } : { width: 32, height: 32 },
    lg: variant === 'full' ? { width: 160, height: 53 } : { width: 48, height: 48 },
  };

  const dimensions = sizeMap[size];
  const logoPath = variant === 'full' 
    ? '/assets/logos/noah-logo.png' 
    : '/assets/logos/noah-icon.png';

  return (
    <img
      src={logoPath}
      alt="Noah"
      width={dimensions.width}
      height={dimensions.height}
      className={`noah-logo ${className}`}
      style={{
        display: 'block',
        maxWidth: '100%',
        height: 'auto',
        margin: '0 auto', // Center the image
      }}
    />
  );
};

export default Logo;
