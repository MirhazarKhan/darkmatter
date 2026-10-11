uniform sampler2D u_texture;
uniform float u_reveal;
uniform float u_flash;
uniform float u_time;
varying vec2 v_uv;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
}
float mist(vec2 p) {
    return noise(p) * 0.55 + noise(p * 2.03 + 3.7) * 0.30 + noise(p * 4.1) * 0.15;
}
void main() {
    vec3 base = texture2D(u_texture, v_uv).rgb;
    vec2 p = v_uv;
    float drift = u_time * 0.065;
    float warp = mist(vec2(p.x * 4.0 - drift, p.y * 3.0 + drift * 0.3));
    float folds = mist(vec2(p.x * 3.8 + drift * 0.5, p.y * 12.0 + warp * 2.7));
    float silk = pow(max(0.0, 1.0 - abs(folds - 0.48) * 11.0), 3.0);
    float thread = pow(max(0.0, 1.0 - abs(folds - 0.57) * 22.0), 4.0);
    float band = exp(-pow((p.y - 0.48 + sin(p.x * 7.0 + drift) * 0.055) * 3.4, 2.0));
    float edge = smoothstep(0.0, 0.13, p.x) * (1.0 - smoothstep(0.87, 1.0, p.x));
    float haze = (silk * 0.10 + thread * 0.065) * band * edge * u_reveal;
    vec3 color = base + vec3(0.83, 0.87, 0.93) * haze;
    float flash = u_flash * exp(-length((p - 0.5) * vec2(1.0, 1.15)) * 4.0);
    color += vec3(0.65, 0.70, 0.85) * flash * 0.28;
    gl_FragColor = vec4(color, 1.0);
}
