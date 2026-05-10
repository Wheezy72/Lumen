import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';

let axiosInterceptorsInstalled = false;
const inFlightListeners = new Set();
let inFlightCount = 0;

function notifyInFlight() {
  inFlightListeners.forEach((listener) => listener(inFlightCount));
}

function installAxiosInterceptors() {
  if (axiosInterceptorsInstalled) return;
  axiosInterceptorsInstalled = true;

  axios.interceptors.request.use((config) => {
    inFlightCount += 1;
    notifyInFlight();
    return config;
  });

  const finish = () => {
    inFlightCount = Math.max(0, inFlightCount - 1);
    notifyInFlight();
  };

  axios.interceptors.response.use(
    (response) => { finish(); return response; },
    (error) => { finish(); return Promise.reject(error); },
  );
}

export default function TopLoadingBar() {
  const location = useLocation();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const [networkBusy, setNetworkBusy] = useState(false);
  const prevPathRef = useRef(location.pathname);
  const timersRef = useRef([]);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  useEffect(() => {
    installAxiosInterceptors();
    const listener = (count) => setNetworkBusy(count > 0);
    inFlightListeners.add(listener);
    listener(inFlightCount);
    return () => { inFlightListeners.delete(listener); };
  }, []);

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

  const showBar = visible || networkBusy;
  const barProgress = visible ? progress : networkBusy ? 70 : 0;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] h-[2px] pointer-events-none"
      aria-hidden="true"
    >
      <div
        className="h-full bg-gradient-to-r from-primary-500 via-violet-400 to-teal-400"
        style={{
          width: `${barProgress}%`,
          opacity: showBar ? 1 : 0,
          transition: 'width 300ms ease-out, opacity 280ms ease',
        }}
      />
    </div>
  );
}
