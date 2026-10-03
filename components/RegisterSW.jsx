"use client";

import { useEffect } from "react";

// Registers the small offline helper (public/sw.js) so installed apps open fast and still show
// the last page seen without internet. Only in production builds.
export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
