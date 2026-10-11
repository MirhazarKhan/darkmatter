float viewDistance(float depth, vec2 clipPlanes) {
    return clipPlanes.x * clipPlanes.y / max(0.0001,
        clipPlanes.y - depth * (clipPlanes.y - clipPlanes.x));
}

float farDepthWeight(vec4 motion, vec2 clipPlanes, vec2 focusRange) {
    return smoothstep(focusRange.x, max(focusRange.x + 0.001, focusRange.y),
        viewDistance(motion.z, clipPlanes)) * step(0.001, motion.a);
}

#pragma glslify: export(farDepthWeight)
