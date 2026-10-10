uniform sampler2D u_texture;
uniform float u_aspect;
uniform float u_strength;
varying vec2 v_uv;

void main() {
    vec2 radial = v_uv - vec2(0.5);
    float edge = smoothstep(0.10, 0.64, length(radial * vec2(u_aspect, 1.0)));
    float strength = u_strength * edge;
    vec3 blurred = vec3(0.0);
    float total = 0.0;
    for (int i = 0; i < 12; i++) {
        float t = float(i) / 11.0;
        float weight = 1.0 - t * 0.65;
        vec2 uv = clamp(v_uv - radial * t * strength * 0.14, vec2(0.001), vec2(0.999));
        blurred += texture2D(u_texture, uv).rgb * weight;
        total += weight;
    }
    vec3 color = blurred / total;
    vec2 split = radial * strength * 0.002;
    color.r = mix(color.r, texture2D(u_texture, clamp(v_uv + split, vec2(0.001), vec2(0.999))).r, strength * 0.35);
    color.b = mix(color.b, texture2D(u_texture, clamp(v_uv - split, vec2(0.001), vec2(0.999))).b, strength * 0.35);
    gl_FragColor = vec4(color, 1.0);
}
