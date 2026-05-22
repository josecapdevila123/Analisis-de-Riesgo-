import React from 'react';

export const BiBankLogo = ({ className = "h-8" }: { className?: string }) => (
  <svg viewBox="0 0 300 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Circle around Bi */}
    <circle cx="50" cy="50" r="45" stroke="black" strokeWidth="8" />
    
    {/* Cyan Dot */}
    <circle cx="85" cy="15" r="10" fill="#00E5FF" />
    
    {/* Text "Bi" inside circle */}
    <text x="25" y="70" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="60" fill="black">Bi</text>
    
    {/* Text "Bank" outside */}
    <text x="110" y="70" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="60" fill="black">Bank</text>
  </svg>
);
