// Scrolling chooses a chapter; its clock owns the transition until it finishes.
exports.create = function (options) {
    options = options || {};
    var endpoints = [0, 0.5, 1, 1.5];
    var reducedMotion = !!options.reducedMotion;
    var forwardDuration = positive(options.forwardDuration, 3);
    var orbitDuration = positive(options.orbitDuration, 4.2);
    var reverseDuration = positive(options.reverseDuration, 2.2);
    var reducedDuration = positive(options.reducedDuration, 0.4);
    var wheelThreshold = positive(options.wheelThreshold, 45);
    var quietMs = positive(options.quietMs, 260);
    var scene = 0;
    var progress = 0;
    var running = false;
    var paused = false;
    var lastNow = 0;
    var pausedAt = 0;
    var transition = null;
    var transitionId = 0;
    var contacts = Object.create(null);
    var contactCount = 0;
    var lastWheelAt = -Infinity;
    var wheelAmount = 0;
    var wheelDirection = 0;
    var needsRearm = false;

    function now(value) {
        value = finite(value, lastNow);
        lastNow = Math.max(lastNow, value);
        return lastNow;
    }

    function clearWheel() {
        wheelAmount = 0;
        wheelDirection = 0;
    }

    function rearm(at) {
        if (needsRearm && !running && !paused && !contactCount && at - lastWheelAt >= quietMs) {
            needsRearm = false;
            clearWheel();
        }
    }

    function advance(at) {
        at = now(at);
        if (running && !paused) {
            transition.elapsed = Math.min(transition.duration, Math.max(0, (at - transition.startedAt) / 1000));
            var amount = transition.elapsed / transition.duration;
            progress = transition.startProgress + (endpoints[transition.to] - transition.startProgress) * amount;
            if (amount >= 1) {
                progress = endpoints[transition.to];
                scene = transition.to;
                running = false;
            }
        }
        rearm(at);
        return at;
    }

    function snapshot() {
        return {
            progress: progress,
            scene: scene,
            running: running,
            paused: paused,
            armed: !running && !paused && !needsRearm,
            from: transition ? transition.from : scene,
            to: transition ? transition.to : scene,
            elapsed: transition ? transition.elapsed : 0,
            duration: transition ? transition.duration : 0,
            direction: transition ? transition.direction : 0,
            kind: transition ? transition.kind : null,
            impactAt: transition ? transition.impactAt : null,
            transitionId: transitionId
        };
    }

    function request(direction, at) {
        at = advance(at);
        direction = finite(direction, 0);
        direction = direction > 0 ? 1 : direction < 0 ? -1 : 0;
        if (!direction || running || paused || needsRearm) return null;
        var destination = Math.max(0, Math.min(endpoints.length - 1, scene + direction));
        if (destination === scene) return null;
        var kind = direction < 0 ? 'return' : destination === 1 ? 'dark' : destination === 2 ? 'red' : 'orbit';
        var duration = reducedMotion ? reducedDuration : direction < 0 ? reverseDuration : kind === 'orbit' ? orbitDuration : forwardDuration;
        transition = {
            from: scene,
            to: destination,
            direction: direction,
            kind: kind,
            startProgress: progress,
            startedAt: at,
            elapsed: 0,
            duration: duration,
            impactAt: reducedMotion || direction < 0 ? null : duration * (kind === 'orbit' ? 0.56 : 0.64)
        };
        transitionId += 1;
        running = true;
        needsRearm = true;
        clearWheel();
        return snapshot();
    }

    function wheel(deltaPx, at) {
        at = advance(at);
        deltaPx = finite(deltaPx, 0);
        if (!deltaPx) return null;
        deltaPx = Math.max(-240, Math.min(240, deltaPx));
        var gap = at - lastWheelAt;
        lastWheelAt = at;
        if (running || paused || needsRearm) {
            // Track inertia only to find its end; never save it for the next chapter.
            clearWheel();
            return null;
        }
        var direction = deltaPx > 0 ? 1 : -1;
        if (gap >= quietMs || direction !== wheelDirection) clearWheel();
        wheelDirection = direction;
        wheelAmount += Math.abs(deltaPx);
        if (wheelAmount < wheelThreshold) return null;
        clearWheel();
        return request(direction, at);
    }

    function hold(key) {
        if (paused || typeof key !== 'string' || !key || contacts[key]) return snapshot();
        contacts[key] = true;
        contactCount += 1;
        return snapshot();
    }

    function release(key, at) {
        if (typeof key === 'string' && contacts[key]) {
            delete contacts[key];
            contactCount -= 1;
        }
        advance(at);
        return snapshot();
    }

    function pause(at) {
        at = advance(at);
        if (!paused) {
            paused = true;
            pausedAt = at;
        }
        contacts = Object.create(null);
        contactCount = 0;
        clearWheel();
        needsRearm = true;
        return snapshot();
    }

    function resume(at) {
        at = now(at);
        if (paused) {
            if (running) transition.startedAt += at - pausedAt;
            paused = false;
        }
        advance(at);
        return snapshot();
    }

    function clear(at, nextProgress) {
        at = now(at);
        progress = Math.max(0, Math.min(endpoints[endpoints.length - 1], finite(nextProgress, 0)));
        scene = Math.max(0, Math.min(endpoints.length - 1, Math.round(progress * 2)));
        running = false;
        paused = false;
        transition = null;
        contacts = Object.create(null);
        contactCount = 0;
        // Restarting must not turn the end of the current wheel gesture into a new one.
        needsRearm = at - lastWheelAt < quietMs;
        clearWheel();
        return snapshot();
    }

    return {
        request: request,
        wheel: wheel,
        hold: hold,
        release: release,
        tick: function (at) { advance(at); return snapshot(); },
        pause: pause,
        resume: resume,
        reset: function (at) { return clear(at, 0); },
        seek: function (nextProgress, at) { return clear(at, nextProgress); }
    };
};

function finite(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
}

function positive(value, fallback) {
    return Math.max(0.01, Math.min(60000, finite(value, fallback) > 0 ? finite(value, fallback) : fallback));
}
