/**
 * Legacy flight interaction radius in scene units.
 *
 * Flight collisions and capture deliberately follow the rendered planet size
 * in both display modes. Centralizing this policy keeps it distinct from an
 * unscaled simulation radius; replacing it with a physical collision model
 * requires a separate gameplay decision. fallback preserves each caller's
 * historical default for bodies without radius metadata.
 */
export function flightInteractionRadius(body, fallback) {
    const mesh = body?.mesh;
    const radius = mesh?.userData?.radius || fallback;
    const scale = mesh ? mesh.scale.x : 1;
    return radius * scale;
}
