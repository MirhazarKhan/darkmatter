// chunk(common);
// chunk(fog_pars_fragment);
// chunk(shadowmap_pars_fragment);

varying float vLife;
varying float vPossession;
uniform vec3 color1;
uniform vec3 color2;
uniform vec3 possessionColor;
uniform float ringMetallic;
varying vec3 vRingNormal;
varying vec3 vRingView;
varying float vRingFacet;
uniform float awaken;
uniform float scorePulse;
uniform float titleBrightness;
varying float vAwakenClan;
varying float vTitleDust;

void main() {

    vec3 outgoingLight = mix(color2, color1, smoothstep(0.0, 0.7, vLife));
    vec3 possessedLight = possessionColor * smoothstep(0.0, 0.32, vLife);
    outgoingLight = mix(outgoingLight, possessedLight, vPossession);

    if (ringMetallic > 0.0) {
        vec3 normal = normalize(vRingNormal);
        vec3 view = normalize(vRingView);
        vec3 key = normalize(vec3(-0.45, 0.68, 0.58));
        vec3 fill = normalize(vec3(0.65, -0.25, 0.72));
        float grain = 0.3 + vRingFacet * 0.8;
        float diffuse = max(0.0, dot(normal, key));
        float rim = pow(1.0 - abs(dot(normal, view)), 2.5);
        float shine = pow(max(0.0, dot(normal, normalize(key + view))), 28.0);
        float glint = pow(max(0.0, dot(normal, normalize(fill + view))), 90.0);
        float sparkle = pow(vRingFacet, 9.0) * (0.06 + shine * 0.65);
        float silver = 0.025 + diffuse * 0.16 * grain + rim * 0.12
            + shine * 0.85 * grain + glint * 1.8 * grain + sparkle;
        vec3 silverLight = vec3(0.88, 0.93, 1.0) * silver;
        outgoingLight = mix(outgoingLight, silverLight, clamp(ringMetallic, 0.0, 1.0));
    }

    if (awaken > 0.0) {
        vec3 energy = vAwakenClan < 0.25 ? vec3(1.0, 0.045, 0.072)
            : vAwakenClan < 0.47 ? vec3(0.38, 0.08, 1.0) : vec3(0.15, 0.28, 1.0);
        float grain = 0.23 + pow(vRingFacet, 0.65) * 0.74;
        float ember = pow(vRingFacet, 13.0) * 0.28;
        vec3 chargedLight = energy * grain * (0.75 + scorePulse * 0.45);
        chargedLight += vec3(0.44, 0.49, 1.0) * ember;
        outgoingLight = mix(outgoingLight, chargedLight, clamp(awaken, 0.0, 1.0));
    }

    if (titleBrightness > 0.0) {
        float silver = 0.075 + pow(vRingFacet, 0.7) * 0.70
            + pow(vRingFacet, 17.0) * 0.38;
        vec3 lettering = vec3(0.90, 0.94, 1.0) * silver;
        lettering *= mix(1.0, 0.065 + vRingFacet * 0.025, vTitleDust);
        outgoingLight = mix(outgoingLight, lettering, clamp(titleBrightness, 0.0, 1.0));
    }

    // chunk(shadowmap_fragment);

    outgoingLight *= shadowMask;//pow(shadowMask, vec3(0.75));

    // chunk(fog_fragment);
    // chunk(linear_to_gamma_fragment);

    gl_FragColor = vec4( outgoingLight, 1.0 );

}
