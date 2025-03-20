// Timer.jsx
import React, { useState, useEffect } from 'react';

const Timer = ({ totalTime = 3600, onTimeEnd }) => {
  // Always calculate timeLeft based on the stored testStartTime
  const getInitialTimeLeft = () => {
    const testStart = localStorage.getItem("testStartTime");
    if (testStart) {
      const elapsed = Math.floor((Date.now() - parseInt(testStart, 10)) / 1000);
      return Math.max(totalTime - elapsed, 0);
    } else {
      localStorage.setItem("testStartTime", Date.now());
      return totalTime;
    }
  };

  const [timeLeft, setTimeLeft] = useState(getInitialTimeLeft);

  useEffect(() => {
    const timerId = setInterval(() => {
      const testStart = localStorage.getItem("testStartTime");
      if (testStart) {
        const elapsed = Math.floor((Date.now() - parseInt(testStart, 10)) / 1000);
        const remaining = Math.max(totalTime - elapsed, 0);
        setTimeLeft(remaining);
        if (remaining <= 0) {
          clearInterval(timerId);
          if (onTimeEnd) onTimeEnd();
        }
      }
    }, 1000);
    return () => clearInterval(timerId);
  }, [totalTime, onTimeEnd]);

  const formatTime = (seconds) => {
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  return (
    <div className="text-lg font-semibold">
      Time: {formatTime(timeLeft)}
    </div>
  );
};

export default Timer;
