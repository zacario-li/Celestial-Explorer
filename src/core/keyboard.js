/**
 * Shared keyboard input state.
 *
 * A single shared `keys` object so that physical key events and the virtual
 * (on-screen) controls write to the exact same state, as before the refactor.
 * - Script wiring (virtual buttons) writes keys here.
 * - Systems (ShipControlSystem, StationKeepingSystem) read from it.
 */
export const keys = {};

let attached = false;

export function attachKeyboard() {
    if (attached || typeof window === 'undefined') return;
    attached = true;
    window.addEventListener('keydown', (e) => {
        keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });
}
