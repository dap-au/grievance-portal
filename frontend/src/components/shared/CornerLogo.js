// frontend/src/components/shared/CornerLogo.js
import React from 'react';
import auroraLogo from '../../aurora logo.jpeg';

const CornerLogo = () => {
  return (
    <a className="corner-logo" href="/dashboard" aria-label="Aurora home">
      <img src={auroraLogo} alt="Aurora logo" className="corner-logo-image" />
    </a>
  );
};

export default CornerLogo;