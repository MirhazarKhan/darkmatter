// A narrow front spreads from the heart of the plume. Its lobes follow the
// volume, while the identity grain is stable and identical for a head and tail.
float possessionMask(vec3 particlePosition, vec2 identity, float progress) {
    if (progress <= 0.0) return 0.0;
    if (progress >= 1.0) return 1.0;
    vec3 core = particlePosition - vec3(0.0, 50.0, 0.0);
    float radius = length(core * vec3(0.85, 0.72, 1.0));
    float angle = atan(core.z, core.x + 0.00001);
    float tendril = sin(angle * 5.0 + core.y * 0.018
        + sin(core.z * 0.019) * 1.8);
    tendril += sin(angle * 9.0 - core.y * 0.011) * 0.42;
    float grain = fract(sin(dot(identity, vec2(127.1, 311.7))) * 43758.5453);
    float arrival = clamp((radius + tendril * 32.0 + (grain - 0.5) * 17.0 - 20.0)
        / 170.0, 0.055, 0.92);
    // Endpoints are deliberately exact: the ivory scene is unaffected, and
    // the completed possession cannot leave stray silver particles behind.
    return smoothstep(arrival - 0.023, arrival + 0.023, progress);
}

#pragma glslify: export(possessionMask)
