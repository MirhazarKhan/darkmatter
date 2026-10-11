exports.sample = function (distance, aspect, arc, closeUp, handoffTravel) {
    arc = Math.max(0, Math.min(1, Number(arc) || 0));
    closeUp = Math.max(0, Math.min(1, Number(closeUp) || 0));
    handoffTravel = Math.max(0, Math.min(1, Number(handoffTravel) || 0));
    var elevation = arc * 52 * Math.PI / 180;
    var azimuth = arc * 18 * Math.PI / 180;
    // Keep the opening framing, then move into the flowing volume for the red scene.
    var finalRadius = Math.max(distance * 1.10, 540 / Math.max(0.35, aspect));
    var radius = distance + (finalRadius - distance) * arc;
    var closeRadius = Math.max(410, 360 / Math.max(0.4, aspect));
    radius += (closeRadius - radius) * closeUp;
    // Move through the fluid before the later arc hands off to its wake.
    radius *= 1 - handoffTravel * 0.31;
    var horizontal = Math.cos(elevation) * radius;
    return {
        x: Math.sin(azimuth) * horizontal,
        y: 50 + Math.sin(elevation) * radius,
        z: Math.cos(azimuth) * horizontal,
        radius: radius,
        elevation: arc * 52,
        azimuth: arc * 18
    };
};

exports.sampleRing = function (time, aspect, reducedMotion) {
    time = Number(time);
    time = reducedMotion || !isFinite(time) ? 0 : Math.max(0, time);
    aspect = Number(aspect);
    aspect = isFinite(aspect) && aspect > 0 ? aspect : 1;
    var radius = Math.max(670, 610 / Math.max(0.35, aspect));
    var azimuth = 0.14 + Math.sin(time * 0.12) * 0.10;
    var elevation = 0.08 + Math.sin(time * 0.16) * 0.025;
    return {
        x: Math.sin(azimuth) * Math.cos(elevation) * radius,
        y: Math.sin(elevation) * radius,
        z: Math.cos(azimuth) * Math.cos(elevation) * radius,
        radius: radius
    };
};
