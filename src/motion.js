// The LinguaLens motion system: the single source of truth for all animations.
//
// Two sources of rules:
//   • Emil Kowalski, design engineering: custom curves (the built-in ones are too weak),
//     durations under 300 ms, exit faster than entrance, never ease-in on the UI,
//     never appearing from scale(0), stagger of 30-80 ms.
//   • Apple, "Designing Fluid Interfaces": a spring is defined by a pair
//     (response, damping), critically damped by default;
//     overshoot is allowed ONLY after a gesture with momentum.
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Easing, LayoutAnimation } from 'react-native';

// ─── Curves ───────────────────────────────────────────────────────────────
// The standard curves are too sluggish, so these are strengthened variants.
// We never use ease-in on the UI: it slows things down at exactly the moment
// when the user is looking at the screen most attentively.
export const EASE = {
  out: Easing.bezier(0.23, 1, 0.32, 1), // appearing/disappearing: instant start
  inOut: Easing.bezier(0.77, 0, 0.175, 1), // movement across the screen
  drawer: Easing.bezier(0.32, 0.72, 0, 1), // drawers and sheets (the iOS curve)
  soft: Easing.bezier(0.4, 0, 0.2, 1), // color and opacity
  linear: Easing.linear, // only timers and progress bars
};

// ─── Durations ────────────────────────────────────────────────────────────
// Everything the user touches is kept under 300 ms:
// 180 ms feels noticeably faster than 400 ms for the same work.
export const DUR = {
  press: 120, // response to a press
  micro: 160, // small state changes
  popover: 190, // hints, dropdowns
  panel: 240, // panels, expanding
  sheet: 280, // sheets, modals
  exit: 170, // exit is always faster than entrance
};

// ─── Springs ──────────────────────────────────────────────────────────────
// Apple deliberately moved away from the mass/stiffness/damping trio in favor of
// two understandable values:
//   response: in how many seconds the value reaches the target (less = sharper)
//   damping:  1.0 is no overshoot; <1 bounces
// We convert to React Native physics: m = 1, k = (2π/T)², c = 2ζ·(2π/T)
export function spring(response = 0.35, damping = 1, extra) {
  const w = (2 * Math.PI) / response;
  return {
    stiffness: Math.round(w * w),
    damping: Math.round(2 * damping * w * 10) / 10,
    mass: 1,
    useNativeDriver: true,
    ...extra,
  };
}

export const SPRING = {
  // By default: NO overshoot. An element that simply appeared
  // should not bounce: in the real world nobody threw it.
  ui: spring(0.35, 1),
  snappy: spring(0.24, 1), // presses, toggles
  calm: spring(0.45, 1), // large surfaces

  // Overshoot only where there was a gesture with momentum before it.
  gesture: spring(0.35, 0.82),
  drawer: spring(0.3, 0.8),
};

// ─── Stagger ──────────────────────────────────────────────────────────────
// 30-80 ms between neighboring elements. More and the interface feels slow.
// We cap it at the sixth so that a long list does not "crawl in".
export const STAGGER_STEP = 55;
export function stagger(index, step = STAGGER_STEP) {
  return Math.min(index, 6) * step;
}

// ─── Reduced motion ───────────────────────────────────────────────────────
// "Reduce motion" does not mean "no feedback": we keep opacity and color changes,
// and remove movement, scale and overshoot.
let reducedCache = false;
AccessibilityInfo.isReduceMotionEnabled?.()
  .then((v) => {
    reducedCache = !!v;
  })
  .catch(() => {});

export function isReducedMotion() {
  return reducedCache;
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(reducedCache);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => {
        reducedCache = !!v;
        if (alive) setReduced(!!v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => {
      reducedCache = !!v;
      setReduced(!!v);
    });
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduced;
}

// A spring that respects the system setting: with reduced motion
// we return a short decay without overshoot.
export function safeSpring(preset = SPRING.ui) {
  return reducedCache ? { ...preset, damping: Math.max(preset.damping, 2 * Math.sqrt(preset.stiffness)) } : preset;
}

// How much to move the element along the axis at all: with reduced motion, not at all.
export function travel(px) {
  return reducedCache ? 0 : px;
}

// ─── Expanding blocks ─────────────────────────────────────────────────────
// The easeInEaseOut preset brings in ease-in, which is banned on the UI:
// it slows down right at the start. We take a clean easeOut and our own duration.
export function layoutNext(duration = DUR.panel) {
  if (reducedCache) return; // with reduced motion the block just changes size
  LayoutAnimation.configureNext({
    duration,
    create: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
    update: { type: LayoutAnimation.Types.easeOut },
    delete: { duration: DUR.exit, type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
  });
}
