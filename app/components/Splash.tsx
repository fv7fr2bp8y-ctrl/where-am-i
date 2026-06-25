"use client";

import { useEffect, useState } from "react";

export default function Splash() {
  const [hidden, setHidden] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setHidden(true), 2200); // старт на fade-out
    const t2 = setTimeout(() => setGone(true), 2900);    // премахване от DOM
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (gone) return null;

  return (
    <div
      className={`splash ${hidden ? "splash-hide" : ""}`}
      style={{
        backgroundImage: "url(/generated/splash.png)",
        backgroundSize: "auto 100%",
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
        backgroundColor: "#2a47b8",
      }}
    >
      <div className="splash-overlay" />
      <div className="splash-content">
        <div className="splash-logo-wrap">
          <span className="splash-ring" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/generated/logo.png" alt="Placetale" className="splash-logo" />
        </div>
        <h1 className="splash-title">Placetale</h1>
        <p className="splash-tag">Историята на твоето място</p>
        <div className="splash-dots">
          <span /><span /><span />
        </div>
      </div>
    </div>
  );
}
