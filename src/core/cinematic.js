function smooth(a, b, value) {
    value = Math.max(0, Math.min(1, (value - a) / (b - a)));
    return value * value * (3 - 2 * value);
}

exports.smooth = smooth;
exports.firstSceneEnd = 0.5;
function sampleOpening(progress, reducedMotion) {
    progress = Math.max(0, Math.min(1, Number(progress) || 0));
    var departure = smooth(0.06, 0.30, progress);
    var rush = smooth(0.12, 0.38, progress) * (1 - smooth(0.58, 0.77, progress));
    var reveal = smooth(0.66, 0.90, progress);
    var slow = smooth(0.62, 0.80, progress);
    var darkness = smooth(0.24, 0.60, progress);
    var timeScale = (1 + rush * 1.4) * (1 - slow) + 0.14 * slow;
    var formation = smooth(0.64, 0.94, progress) * 0.42;
    return {
        progress: progress,
        departure: departure,
        rush: reducedMotion ? 0 : rush,
        darkness: darkness,
        reveal: reveal,
        timeScale: reducedMotion ? 0.16 : timeScale,
        formation: formation,
        travel: reducedMotion ? 0 : smooth(0.13, 0.65, progress),
        nameOpacity: 1 - departure
    };
}

exports.sample = function (progress, reducedMotion) {
    progress = Math.max(0, Math.min(1.5, Number(progress) || 0));
    var openingProgress = Math.min(1, progress / exports.firstSceneEnd);
    var chapterProgress = Math.max(0, (Math.min(1, progress) - exports.firstSceneEnd) / (1 - exports.firstSceneEnd));
    var nextProgress = Math.min(1, chapterProgress * 1.5);
    var phase = sampleOpening(openingProgress, reducedMotion);
    phase.progress = progress;
    phase.openingProgress = openingProgress;
    phase.nextProgress = nextProgress;
    phase.chapterProgress = chapterProgress;
    phase.wipe = smooth(0.04, 0.60, nextProgress);
    phase.red = smooth(0.18, 0.72, chapterProgress);
    phase.arc = reducedMotion ? 0 : smooth(0.58, 1, chapterProgress);
    phase.handoffRush = reducedMotion ? 0 : smooth(0.12, 0.38, chapterProgress) * (1 - smooth(0.58, 0.77, chapterProgress));
    phase.handoffBrake = smooth(0.62, 0.80, chapterProgress);
    phase.handoffTravel = reducedMotion ? 0 : smooth(0.13, 0.65, chapterProgress);
    phase.tailFollow = reducedMotion ? 0 : smooth(0.66, 1, chapterProgress);
    // The same fluid acceleration as the opening, entering from the held slow scene.
    if (chapterProgress > 0) {
        phase.timeScale = reducedMotion ? 0.16 : (0.14 + phase.handoffRush * 2.26) * (1 - phase.handoffBrake) + 0.12 * phase.handoffBrake;
    }
    phase.formation *= 1 - smooth(0.05, 0.34, chapterProgress);
    // Follow the actual rush, then carry a softer blur into the slowing camera arc.
    var arcBlur = smooth(0.58, 0.70, chapterProgress) * (1 - smooth(0.78, 0.98, chapterProgress)) * 0.55;
    phase.transitionBlur = reducedMotion ? 0 : phase.handoffRush + (1 - phase.handoffRush) * arcBlur;
    // The first three chapters keep their established coordinates and choreography.
    var orbitProgress = Math.max(0, (progress - 1) / 0.5);
    phase.orbitProgress = orbitProgress;
    phase.ringFormation = smooth(0.06, 0.78, orbitProgress);
    phase.ringCamera = reducedMotion && orbitProgress > 0 ? 1 : smooth(0.02, 0.88, orbitProgress);
    phase.ringSilver = smooth(0.28, 0.86, orbitProgress);
    phase.ringRush = reducedMotion ? 0 : smooth(0.04, 0.24, orbitProgress) * (1 - smooth(0.48, 0.74, orbitProgress));
    if (orbitProgress > 0) {
        phase.timeScale = reducedMotion ? 0.16 : 0.12 + smooth(0.01, 0.64, orbitProgress) * 0.68 + phase.ringRush * 0.60;
        phase.transitionBlur = reducedMotion ? 0 : phase.ringRush * 0.72;
    }
    return phase;
};
