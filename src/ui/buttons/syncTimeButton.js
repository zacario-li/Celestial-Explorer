import { Button } from './button.js';

export function initSyncTimeButton(syncFn) {
    return new Button('sync-time-button', () => {
        if (syncFn) syncFn();
    });
}
