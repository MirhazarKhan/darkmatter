var PI = Math.PI;
var TURN = PI * 2;
var DEG = PI / 180;

// One authored shot owns both the eye and its focus. Tracking uses wall time,
// so the particle brake cannot turn a smooth move into a late camera correction.
exports.create = function () {
    var start = null, target = null, tracked = null;
    var rawAzimuth = 0, trackedAzimuth = 0, previousProgress = 0;

    function begin(eye, aim) {
        aim = point(aim, { x: 0, y: 50, z: 0 });
        eye = point(eye, { x: 0, y: 50, z: 537.3 });
        var offset = direction(eye.x - aim.x, eye.y - aim.y, eye.z - aim.z);
        start = { eye: eye, aim: aim, radius: offset.radius,
            azimuth: offset.azimuth, elevation: offset.elevation };
        target = tracked = null; previousProgress = 0;
    }

    function update(tail, progress, dt, aspect) {
        progress = clamp(finite(progress, 0));
        dt = Math.max(0, Math.min(50, finite(dt, 0)));
        aspect = Math.max(0.2, finite(aspect, 1));
        if (!start) {
            var titleDistance = Math.max(670, 350 / Math.max(0.4, aspect)) * 0.69 + 75;
            begin({ x: 0, y: 50, z: titleDistance }, { x: 0, y: 50, z: 0 });
        }
        if (!target || dt > 0) {
            tail = tail || {};
            var aim = point({ x: tail.lookX, y: tail.lookY, z: tail.lookZ }, start.aim);
            var eye = point(tail, { x: aim.x, y: aim.y + 12, z: aim.z + 128 });
            var end = direction(eye.x - aim.x, eye.y - aim.y, eye.z - aim.z);
            // The rush follows an authored heading instead of chasing every
            // emitter lap. Choose the live docking branch only as the brake
            // arrives, then carry it continuously across the angle boundary.
            // Rebase held scenes so their history cannot add turns to a reverse.
            var routeAzimuth = start.azimuth + 18 * DEG;
            var rebase = !target || progress <= 0.64 || previousProgress <= 0.64 || progress === 1 || previousProgress === 1;
            rawAzimuth = rebase ? routeAzimuth + wrap(end.azimuth - routeAzimuth)
                : rawAzimuth + wrap(end.azimuth - rawAzimuth);
            if (rebase) trackedAzimuth = rawAzimuth;
            target = { eye: eye, aim: aim, radius: end.radius,
                azimuth: rawAzimuth, elevation: end.elevation };
            if (!tracked) {
                tracked = { aim: point(aim, aim), radius: end.radius, elevation: end.elevation };
                trackedAzimuth = rawAzimuth;
            } else {
                var response = 1 - Math.exp(-dt / 280);
                tracked.aim.x = mix(tracked.aim.x, aim.x, response);
                tracked.aim.y = mix(tracked.aim.y, aim.y, response);
                tracked.aim.z = mix(tracked.aim.z, aim.z, response);
                tracked.radius = mix(tracked.radius, end.radius, response);
                tracked.elevation = mix(tracked.elevation, end.elevation, response);
                trackedAzimuth = mix(trackedAzimuth, rawAzimuth, response);
            }
        }

        var dolly = smoother(0.02, 0.55, progress);
        var turn = smoother(0.10, 0.90, progress);
        var dock = smoother(0.52, 1, progress);
        var endAzimuth = mix(trackedAzimuth, target.azimuth, dock);
        var endElevation = mix(tracked.elevation, target.elevation, dock);
        var endRadius = mix(tracked.radius, target.radius, dock);
        var endAim = {
            x: mix(tracked.aim.x, target.aim.x, dock),
            y: mix(tracked.aim.y, target.aim.y, dock),
            z: mix(tracked.aim.z, target.aim.z, dock)
        };
        var focus = smoother(0.12, 0.90, progress);
        var aimX = mix(start.aim.x, endAim.x, focus);
        var aimY = mix(start.aim.y, endAim.y, focus);
        var aimZ = mix(start.aim.z, endAim.z, focus);
        var liveHeading = smoother(0.64, 1, progress);
        var azimuth = mix(mix(start.azimuth, start.azimuth + 18 * DEG, turn), endAzimuth, liveHeading);
        // The rise begins with the rush and descends into the wake; it is never
        // a second destination layered over the docking rotation.
        var arcRoom = Math.max(0, 68 * DEG - Math.max(start.elevation, endElevation));
        var arcLift = Math.sin(PI * smoother(0.08, 0.94, progress)) * Math.min(26 * DEG, arcRoom);
        var elevation = mix(mix(start.elevation, 10 * DEG, turn) + arcLift, endElevation, liveHeading);
        var approachRadius = Math.min(start.radius, Math.max(200, endRadius * 2.1));
        var radius = mix(mix(start.radius, approachRadius, dolly), endRadius, dock);
        var horizontal = Math.cos(elevation) * radius;
        var pose = {
            x: aimX + Math.sin(azimuth) * horizontal,
            y: aimY + Math.sin(elevation) * radius,
            z: aimZ + Math.cos(azimuth) * horizontal,
            lookX: aimX, lookY: aimY, lookZ: aimZ,
            radius: radius, azimuth: azimuth / DEG, elevation: elevation / DEG,
            dolly: dolly, turn: turn, dock: dock, arcLift: arcLift / DEG
        };
        // Preserve both live endpoints exactly, including the close tail shot
        // used as the start of the next ring chapter.
        if (progress === 0 || progress === 1) {
            var endpoint = progress === 0 ? start : target;
            pose.x = endpoint.eye.x; pose.y = endpoint.eye.y; pose.z = endpoint.eye.z;
            pose.lookX = endpoint.aim.x; pose.lookY = endpoint.aim.y; pose.lookZ = endpoint.aim.z;
            pose.radius = endpoint.radius;
            pose.arcLift = 0;
        }
        previousProgress = progress;
        return pose;
    }

    return {
        begin: begin, update: update,
        hasStart: function () { return !!start; },
        reset: function () { start = target = tracked = null; rawAzimuth = trackedAzimuth = previousProgress = 0; }
    };
};

function point(value, fallback) {
    value = value || {};
    return { x: coordinate(value.x, fallback.x), y: coordinate(value.y, fallback.y), z: coordinate(value.z, fallback.z) };
}
function coordinate(value, fallback) { return Math.max(-1000000, Math.min(1000000, finite(value, fallback))); }
function direction(x, y, z) {
    var radius = Math.max(1, Math.sqrt(x * x + y * y + z * z));
    return { radius: radius, azimuth: Math.atan2(x, z), elevation: Math.asin(Math.max(-1, Math.min(1, y / radius))) };
}
function finite(value, fallback) { return typeof value === 'number' && isFinite(value) ? value : fallback; }
function clamp(value) { return Math.max(0, Math.min(1, value)); }
function mix(a, b, weight) { return a + (b - a) * weight; }
function wrap(value) { return ((value + PI) % TURN + TURN) % TURN - PI; }
function smoother(a, b, value) { var t = clamp((value - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); }
