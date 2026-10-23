"use client";

import { useSyncExternalStore } from "react";

const mediaSubscribers = new Map<string, (onChange: () => void) => () => void>();

function subscribeMedia(query: string) {
  let subscribe = mediaSubscribers.get(query);
  if (!subscribe) {
    subscribe = (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    };
    mediaSubscribers.set(query, subscribe);
  }
  return subscribe;
}

/** SSR-safe media query hook (server snapshot = `serverValue`). */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    subscribeMedia(query),
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** True while the tab is hidden; used to pause the render loop. */
export function useDocumentHidden(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "hidden",
    () => false,
  );
}

const noopSubscribe = () => () => {};

/** False during SSR and hydration, true afterwards — without setState in an effect. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
