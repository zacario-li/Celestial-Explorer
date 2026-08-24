import { state } from '../state.js';

/**
 * AmbientSystem — sun spin, glow pulses, starfield drift
 * (was script.js animate(), ~L1258-1264).
 */
export class AmbientSystem {
    constructor(ctx) {
        this.ctx = ctx;
    }

    update() {
        const { ctx } = this;
        const scriptedDt = ctx.scriptedDt;

        ctx.sun.rotation.y += 0.00148 * scriptedDt;

        const pulse = 1 + 0.03 * Math.sin(state.virtualTime * 1.2);
        ctx.glowSphere.scale.setScalar(pulse);
        ctx.glowSphere2.scale.setScalar(1 + 0.02 * Math.sin(state.virtualTime * 0.8 + 1));
        ctx.glowSphere3.scale.setScalar(1 + 0.015 * Math.sin(state.virtualTime * 0.5 + 2));

        ctx.starField.rotation.y = state.virtualTime * 0.0005;
        ctx.starField.rotation.x = state.virtualTime * 0.0002;
    }
}
