uniform sampler2D u_texture;
uniform sampler2D u_motionTexture;
uniform vec2 u_resolution;
uniform vec2 u_clipPlanes;
uniform vec2 u_focusRange;
uniform float u_depthStrength;
uniform float u_farBlurRadius;

varying vec2 v_uv;

#pragma glslify: farDepthWeight = require(./depthWeight.glsl)

vec4 focusTap(vec2 uv) {
    vec4 motion = texture2D(u_motionTexture, uv);
    float farWeight = farDepthWeight(motion, u_clipPlanes, u_focusRange);
    // Empty background is valid; close particles must not bleed into distant ones.
    float valid = mix(1.0, farWeight, step(0.001, motion.a));
    float weight = 0.10 * valid;
    return vec4(texture2D(u_texture, uv).rgb * weight, weight);
}

void main() {
    vec4 centerMotion = texture2D(u_motionTexture, v_uv);
    vec3 center = texture2D(u_texture, v_uv).rgb;
    float farWeight = farDepthWeight(centerMotion, u_clipPlanes, u_focusRange);
    // A foreground silhouette always stays sharp, including where a far trail crosses it.
    if (farWeight <= 0.0001 || u_farBlurRadius <= 0.0001) {
        gl_FragColor = vec4(center, 1.0);
        return;
    }

    vec2 radius = vec2(u_farBlurRadius) / u_resolution;
    // Explicit constant taps avoid derivative-in-loop warnings on WebGL1/ANGLE.
    vec4 sum = vec4(center * 0.20, 0.20);
    sum += focusTap(v_uv + radius * vec2(1.0, 0.0));
    sum += focusTap(v_uv + radius * vec2(0.70710678, 0.70710678));
    sum += focusTap(v_uv + radius * vec2(0.0, 1.0));
    sum += focusTap(v_uv + radius * vec2(-0.70710678, 0.70710678));
    sum += focusTap(v_uv + radius * vec2(-1.0, 0.0));
    sum += focusTap(v_uv + radius * vec2(-0.70710678, -0.70710678));
    sum += focusTap(v_uv + radius * vec2(0.0, -1.0));
    sum += focusTap(v_uv + radius * vec2(0.70710678, -0.70710678));
    gl_FragColor = vec4(mix(center, sum.rgb / max(sum.a, 0.0001),
        farWeight * u_depthStrength), 1.0);
}
