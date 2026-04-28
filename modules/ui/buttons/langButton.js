import { Button } from './button.js';
import { state } from '../../state.js';
import { applyLanguage } from '../../ui.js';

export function initLangButton() {
    return new Button('lang-button', async () => {
        state.currentLang = state.currentLang === 'en' ? 'zh' : 'en';
        await applyLanguage();
    });
}
