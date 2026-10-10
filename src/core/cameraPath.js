exports.sample = function (distance, aspect, arc) {
    arc = Math.max(0, Math.min(1, Number(arc) || 0));
    var elevation = arc * 52 * Math.PI / 180;
    var azimuth = arc * 18 * Math.PI / 180;
    // Pull back as the upper view opens, with extra framing for a narrow screen.
    var finalRadius = Math.max(distance * 1.10, 540 / Math.max(0.35, aspect));
    var radius = distance + (finalRadius - distance) * arc;
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
