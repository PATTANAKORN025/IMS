'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A WebGL placeholder, deliberately NOT the real scene and deliberately NOT
 * Three.js/R3F -- the spike's only job is proving a canvas can get a real
 * WebGL2 context and paint through this exact deployment path (basePath +
 * reverse proxy + auth_request). Pulling in Three.js here would test
 * nothing about the proxy/basePath question this spike exists to answer,
 * and risks the reader mistaking spike code for a production R3F start.
 */
export default function WebglPlaceholder() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState('checking WebGL2...');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2');
    if (!gl) {
      setStatus('WebGL2 unavailable in this browser');
      return;
    }
    gl.clearColor(0.06, 0.09, 0.16, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    setStatus(`WebGL2 OK -- ${gl.getParameter(gl.VERSION)}`);
  }, []);

  return (
    <div>
      <canvas ref={canvasRef} width={320} height={180} style={{ border: '1px solid #334155' }} />
      <p data-testid="webgl-status">{status}</p>
    </div>
  );
}
