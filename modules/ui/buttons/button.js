import { t } from '../../i18n.js';

export class Button {
    constructor(id, onClick, options = {}) {
        this.element = document.getElementById(id);
        if (!this.element) {
            console.warn(`Button with ID "${id}" not found.`);
            return;
        }

        this.onClick = onClick;
        this.options = options; // e.g. stateKey, labels, background colors

        this.element.addEventListener('click', (e) => {
            if (this.onClick) this.onClick.call(this.element, e);
            this.update();
        });

        this.update();
    }

    update() {
        if (!this.element || !this.options.stateKey) return;
        
        const isActive = this.options.stateObject ? this.options.stateObject[this.options.stateKey] : false;
        
        if (this.options.labels) {
            this.element.textContent = isActive ? t(this.options.labels.on) : t(this.options.labels.off);
        }

        if (this.options.activeClass) {
            this.element.classList.toggle(this.options.activeClass, isActive);
        }

        if (this.options.colors) {
            this.element.style.borderColor = isActive ? this.options.colors.on : this.options.colors.off;
            this.element.style.background = isActive ? this.options.colors.onBg : this.options.colors.offBg;
        }
    }
}
