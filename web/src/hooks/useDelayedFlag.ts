import { useEffect, useState } from "react";

/** True once `value` has been true for `delayMs`. Goes false at once when `value` does. */
export const useDelayedFlag = (value: boolean, delayMs: number): boolean => {
  const [flag, setFlag] = useState(false);
  useEffect(() => {
    if (!value) {
      setFlag(false);
      return;
    }
    if (delayMs <= 0) {
      setFlag(true);
      return;
    }
    const timer = setTimeout(() => setFlag(true), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return value && delayMs <= 0 ? true : flag;
};
