float ringSeed(vec2 identity, float offset) {
    return fract(sin(dot(identity, vec2(127.1, 311.7)) + offset * 74.73) * 43758.5453);
}

vec3 ringTurn(vec3 value, float time) {
    float x = time * 0.23 + sin(time * 0.27) * 0.17;
    float y = time * 0.17 + sin(time * 0.19) * 0.21;
    float z = time * 0.13;
    value.yz = mat2(cos(x), sin(x), -sin(x), cos(x)) * value.yz;
    value.xz = mat2(cos(y), -sin(y), sin(y), cos(y)) * value.xz;
    value.xy = mat2(cos(z), sin(z), -sin(z), cos(z)) * value.xy;
    return value;
}

vec3 ringPosition(vec2 identity, float time, out vec3 surfaceNormal) {
    float phase = ringSeed(identity, 1.0);
    float shell = ringSeed(identity, 3.0);
    // Particles circulate along one continuous, thick surface. The tube also
    // rolls around its own cross-section while the entire form slowly tumbles.
    float angle = phase * 6.28318530718 + time * (0.38 + shell * 0.045);
    float tubeAngle = ringSeed(identity, 2.0) * 6.28318530718 + time * 0.31;
    float major = 140.0 + sin(angle * 3.0 + time * 0.55) * 12.0
        + sin(angle * 5.0 - time * 0.34) * 6.0;
    float tube = (54.0 + sin(angle * 2.0 - time * 0.4) * 5.0
        + sin(time * 0.62) * 4.0) * (0.93 + shell * 0.07);
    float radial = major + cos(tubeAngle) * tube;
    vec3 position = vec3(cos(angle) * radial, sin(angle) * radial,
        sin(tubeAngle) * tube + sin(angle * 2.0 + time * 0.41) * 14.0
        + sin(angle * 3.0 - time * 0.25) * 7.0);
    surfaceNormal = ringTurn(vec3(cos(tubeAngle) * cos(angle),
        cos(tubeAngle) * sin(angle), sin(tubeAngle)), time);
    return ringTurn(position, time) + vec3(0.0, 50.0, 0.0);
}

#pragma glslify: export(ringPosition)
