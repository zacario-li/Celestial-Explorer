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

const isTypingTarget = (el) => !!(el && (el.tagName === 'INPUT'
    || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable));

export function attachKeyboard() {
    if (attached || typeof window === 'undefined') return;
    attached = true;
    window.addEventListener('keydown', (e) => {
        // flight keys must not fire while the user types into a modal field
        // (the R-toggle already had this guard; shared it here)
        if (isTypingTarget(e.target)) return;
        keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });
    // If the page loses focus while a key is held, the OS swallows the
    // keyup -- without this, a stick W would fire the ship forever after
    // alt-tabbing back.
    window.addEventListener('blur', () => {
        for (const k in keys) keys[k] = false;
    });
}
