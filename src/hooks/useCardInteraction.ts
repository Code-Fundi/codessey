"use client";

import { useCallback, useState } from "react";

type CardInteractionVars = React.CSSProperties & {
  "--holo-x": string;
  "--holo-y": string;
  "--holo-o": string;
};

const IDLE_HOLO = {
  "--holo-x": "50%",
  "--holo-y": "30%",
  "--holo-o": "0.16",
} as const;

const FLIP_MS = 700;

export function useCardInteraction(maxTilt = 12) {
  const [flipped, setFlipped] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [tiltResetting, setTiltResetting] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [holoVars, setHoloVars] = useState<CardInteractionVars>(IDLE_HOLO);

  const updateTilt = useCallback(
    (clientX: number, clientY: number, el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
      const nx = (x / 100) * 2 - 1;
      const ny = (y / 100) * 2 - 1;
      const edge = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 0.82);
      setTiltResetting(false);
      setTilt({ x: -edge(ny) * maxTilt, y: edge(nx) * maxTilt });
      setHoloVars({ "--holo-x": `${x}%`, "--holo-y": `${y}%`, "--holo-o": "0.55" });
    },
    [maxTilt],
  );

  const flip = useCallback(() => {
    setRotating(true);
    setFlipped((v) => !v);
    window.setTimeout(() => setRotating(false), FLIP_MS);
  }, []);

  const resetTilt = useCallback(() => {
    setTiltResetting(true);
    setTilt({ x: 0, y: 0 });
    setHoloVars(IDLE_HOLO);
  }, []);

  const reset = useCallback(() => {
    setFlipped(false);
    setTiltResetting(false);
    setTilt({ x: 0, y: 0 });
    setHoloVars(IDLE_HOLO);
    setRotating(false);
  }, []);

  return {
    flipped,
    tilt,
    tiltResetting,
    rotating,
    holoVars,
    updateTilt,
    flip,
    resetTilt,
    reset,
  };
}
