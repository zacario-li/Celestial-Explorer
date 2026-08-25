import { Button } from './button.js';
import { state } from '../../core/state.js';
import { applyLanguage } from '../uiCore.js';

export function initLangButton() {
    return new Button('lang-button', async () => {
        state.currentLang = state.currentLang === 'en' ? 'zh' : 'en';
        await applyLanguage();
    });
}
