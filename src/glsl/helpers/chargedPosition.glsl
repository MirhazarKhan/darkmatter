float chargedSeed(vec2 identity, float offset) {
    return fract(sin(dot(identity, vec2(127.1, 311.7)) + offset * 74.73) * 43758.5453);
}

vec3 chargedPosition(vec2 identity, float time, float pulse) {
    float phase = chargedSeed(identity, 1.0);
    float cross = chargedSeed(identity, 2.0);
    float clan = chargedSeed(identity, 4.0);
    float thickness = chargedSeed(identity, 3.0) - 0.5;
    float opening = smoothstep(0.2, 3.35, time);
    float a = phase * 6.28318530718 + time * (0.59 + clan * 0.14);
    float b = cross * 6.28318530718 + time * 0.43;
    vec3 point;
    if (clan < 0.25) {
        // A dense red membrane rolls inside the expanding violet-blue wings.
        float core = 73.0 + cos(b) * (25.0 + opening * 10.0);
        core += sin(a * 3.0 - time * 1.7) * (9.0 + pulse * 12.0);
        point = vec3(cos(a) * core, sin(a) * core,
            sin(b) * 38.0 + sin(a * 2.0 + time * 1.4) * 21.0);
        point.xy *= 1.0 + pulse * 0.12;
    } else {
        // The wider surface remains connected, folding into long swept petals.
        float wing = pow(0.5 + sin(a - time * 0.29) * 0.5, 2.0);
        float major = 122.0 + opening * (35.0 + wing * 108.0);
        major += cos(b) * (32.0 + opening * 28.0);
        major += sin(a * 3.0 + b * 0.7 - time * 1.1) * (9.0 + pulse * 10.0);
        point = vec3(cos(a) * major, sin(a) * major,
            sin(b) * (38.0 + opening * 33.0));
        point.z += sin(a * 2.0 + time * 1.2) * (22.0 + opening * 35.0);
        point.y += sin(a * 3.0 + b - time * 0.9) * opening * 20.0;
        point.x += sin(a + b * 0.6 + time * 0.6) * opening * wing * 35.0;
    }
    point += vec3(sin(a * 17.0 + b * 7.0 + time * 1.8),
        cos(a * 13.0 - b * 11.0 + time * 1.1), sin(a * 19.0 + b * 5.0)) * (1.3 + thickness * 1.9);
    float turn = time * 0.20;
    float tilt = 0.32 + sin(time * 0.38) * 0.28;
    point.yz = mat2(cos(tilt), sin(tilt), -sin(tilt), cos(tilt)) * point.yz;
    point.xy = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * point.xy;
    return point + vec3(0.0, 50.0, 0.0);
}

#pragma glslify: export(chargedPosition)
