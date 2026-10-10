// chunk(common);

uniform vec3 possessionColor;
uniform float strength;
varying float vAlong;
varying float vSide;
varying float vLife;
varying float vValid;
varying float vPossession;

void main() {
    float fade = 1.0 - smoothstep(0.03, 1.0, vAlong);
    float edge = 1.0 - smoothstep(0.6, 1.0, abs(vSide));
    float alpha = strength * vPossession * vValid
        * smoothstep(0.0, 0.18, vLife) * fade * edge * 0.72;
    if (alpha < 0.001) discard;
    vec3 outgoingLight = mix(vec3(0.0), possessionColor, pow(fade, 1.35));
    // chunk(linear_to_gamma_fragment);
    gl_FragColor = vec4(outgoingLight, alpha);
}
