/**
 * Physics integration sub-step policy.
 *
 * History: the engine ran a FIXED 45 sub-steps whenever the speed multiplier
 * was >1 and a single step at 1×. With the app's gravity scale (G ≈ 9.6e-13,
 * GM_sun ≈ 9.6e-7) pure two-body orbits are so slow in simulated time that
 * even 45-split steps integrate them well — the failure mode of the legacy
 * policy is instead *unbounded per-step size*: at 10⁶× each step covered
 * ~1111 s, so close encounters / softening spikes (the planet force has a
 * `(dSq + 25)` softening term) and the shipped-planet chaos scenario could
 * jump entire orbits in one step, which is what the app's NaN self-heal
 * patches were constantly papering over.
 *
 * Policy — a *monotone refinement* of the legacy behavior:
 *
 *   paused / dt = 0  → 0
 *   multiplier ≤ 1   → 1                                   (legacy, bit-identical)
 *   multiplier > 1   → max(45, ceil(physicsDt / MAX_SUBSTEP_SECONDS))
 *
 *  - the 45 floor keeps the legacy path bit-exact for every multiplier where
 *    it was already numerically sound (≤ ~450× at the 0.05 s frame clamp)
 *  - above that it adds sub-steps so no individual step exceeds
 *    MAX_SUBSTEP_SECONDS (strictly finer than legacy at high speed)
 *  - MAX_SUBSTEPS caps the frame cost at extreme multipliers (even the cap
 *    is still 45× finer per-step than legacy)
 */
export const MAX_SUBSTEP_SECONDS = 0.5;
export const HIGH_SPEED_SUBSTEP_FLOOR = 45;
export const MAX_SUBSTEPS = 2048;

/**
 * @param {number} physicsDt            Seconds of simulated time this frame.
 * @param {number} simSpeedMultiplier   Current user speed multiplier.
 * @returns {number} sub-steps to run this frame (0 while paused)
 */
export function computeSubSteps(physicsDt, simSpeedMultiplier) {
    if (!(physicsDt > 0)) return 0;
    if (simSpeedMultiplier <= 1) return 1;
    const byStep = Math.ceil(physicsDt / MAX_SUBSTEP_SECONDS);
    return Math.min(MAX_SUBSTEPS, Math.max(HIGH_SPEED_SUBSTEP_FLOOR, byStep));
}

/** The pre-refactor policy, kept for regression testing. */
export function legacySubSteps(physicsDt, simSpeedMultiplier) {
    if (!(physicsDt > 0)) return 0;
    return simSpeedMultiplier > 1 ? 45 : 1;
}
