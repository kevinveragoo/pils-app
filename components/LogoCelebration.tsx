//
//  LogoCelebration.tsx
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type CSSProperties } from "react";

const confettiEmojis = ["🏳️‍🌈", "🏳️‍⚧️", "🇲🇺", "🌈", "😸", "🤖", "🏃", "🏋"];

const flags = Array.from({ length: 64 }, (_, index) => ({
  emoji: confettiEmojis[index % confettiEmojis.length],
  style: {
    left: `${(index * 37) % 100}%`,
    fontSize: `${24 + (index % 5) * 5}px`,
    "--flag-delay": `${-(index % 13) * 0.3}s`,
    "--flag-duration": `${2.8 + (index % 7) * 0.25}s`,
    "--flag-drift": `${((index * 29) % 160) - 80}px`,
    "--flag-turn": `${index % 2 === 0 ? 330 : -330}deg`,
    "--flag-rest": `${(index * 17) % 90}vh`,
  } as CSSProperties,
}));

export default function LogoCelebration({ className }: { className: string }) {
  const clicks = useRef({ count: 0, startedAt: 0 });
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [celebration, setCelebration] = useState(0);
  useEffect(() => () => { if (timeout.current) clearTimeout(timeout.current); }, []);

  function clickLogo() {
    const now = performance.now();
    if (clicks.current.count === 0 || now - clicks.current.startedAt > 2000) {
      clicks.current = { count: 1, startedAt: now };
    } else {
      clicks.current.count += 1;
    }
    if (clicks.current.count < 5) return;
    clicks.current = { count: 0, startedAt: 0 };
    if (timeout.current) clearTimeout(timeout.current);
    setCelebration(value => value + 1);
    timeout.current = setTimeout(() => setCelebration(0), 5000);
  }

  return <>
    <button type="button" className="pils-logo-trigger" style={{ cursor: "default" }} aria-label="PILS" onPointerDown={event => { if (event.isPrimary && event.button === 0) { event.preventDefault(); clickLogo(); } }} onClick={event => { if (event.detail === 0) clickLogo(); }}>
      <Image src="/pils-logo.svg" alt="PILS" width={1112} height={761} priority draggable={false} style={{ cursor: "default", pointerEvents: "none" }} className={className} />
    </button>
    {celebration > 0 && createPortal(<div key={celebration} className="pils-flag-confetti" aria-hidden="true">
      {flags.map((flag, index) => <span key={index} className="pils-flag-piece" style={flag.style}>{flag.emoji}</span>)}
    </div>, document.body)}
  </>;
}
