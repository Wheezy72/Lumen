import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

export default function TopLoadingBar() {
  const location = useLocation();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const prevPathRef = useRef(location.pathname);
  const timersRef = useRef([]);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  useEffect(() => {
    if (location.pathname === prevPathRef.current) return;
    prevPathRef.current = location.pathname;

    clearTimers();
    setVisible(true);
    setProgress(0);

    // Quick jump to 60%, then crawl to 85%, then complete
    timersRef.current.push(setTimeout(() => setProgress(60), 20));
    timersRef.current.push(setTimeout(() => setProgress(85), 250));
    timersRef.current.push(
      setTimeout(() => {
        setProgress(100);
        timersRef.current.push(
          setTimeout(() => {
            setVisible(false);
            setProgress(0);
          }, 280)
        );
      }, 450)
    );

    return clearTimers;
  }, [location.pathname]);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] h-[2px] pointer-events-none"
      aria-hidden="true"
    >
      <div
        className="h-full bg-gradient-to-r from-primary-500 to-secondary-400 transition-all duration-300 ease-out"
        style={{
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
          transition: progress === 0 ? 'none' : 'width 300ms ease-out, opacity 280ms ease',
        }}
      />
    </div>
  );
}
