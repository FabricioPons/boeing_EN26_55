// Weighted linear fit of Arduino millis() vs browser performance.now().
//
// Each ping sample gives us one (localMid, arduinoT) point where the Arduino's
// clock M was observed at local time L = (send+receive)/2, plus an RTT that
// tells us how trustworthy that observation is (small RTT = small asymmetry
// window = more trustworthy).
//
// We fit  arduino_t ≈ offset + skew * local_t  with weights w = 1/(rtt^2).
// The skew term is what lets us track the tiny rate difference between the
// two crystals — that's what was causing the sawtooth between ping-syncs.
export function fitClock(samples) {
  if (samples.length === 0) return null;
  if (samples.length === 1) {
    const s = samples[0];
    return { offset: s.arduinoT - s.localMid, skew: 1, n: 1 };
  }

  const t0 = samples[0].localMid;  // Normalize x to avoid float precision loss
  let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
  for (const s of samples) {
    const w = 1 / Math.max(1, s.rtt * s.rtt);
    const x = s.localMid - t0;
    const y = s.arduinoT;
    sw += w;
    swx += w * x;
    swy += w * y;
    swxx += w * x * x;
    swxy += w * x * y;
  }
  const meanX = swx / sw;
  const meanY = swy / sw;
  const denom = swxx - sw * meanX * meanX;

  let skew;
  if (Math.abs(denom) < 1e-6) {
    skew = 1;  // All samples at ~same time, can't estimate drift
  } else {
    skew = (swxy - sw * meanX * meanY) / denom;
  }
  const offsetNorm = meanY - skew * meanX;  // arduino_t at local_t = t0
  const offset = offsetNorm - skew * t0;    // arduino_t at local_t = 0
  return { offset, skew, n: samples.length };
}

// Given a fit and a local performance.now() value, estimate what the Arduino
// clock read at that instant.
export function arduinoAtLocal(fit, localT) {
  return fit.offset + fit.skew * localT;
}

// Given a fit and an Arduino millis() value, estimate what local time it
// corresponds to. Used to answer "when did the Arduino fire this event, in my
// clock's frame?"
export function localAtArduino(fit, arduinoT) {
  return (arduinoT - fit.offset) / fit.skew;
}
