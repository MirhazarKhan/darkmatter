// chunk(common);
// chunk(fog_pars_fragment);
// chunk(shadowmap_pars_fragment);

varying float vLife;
varying float vPossession;
uniform vec3 color1;
uniform vec3 color2;
uniform vec3 possessionColor;

void main() {

    vec3 outgoingLight = mix(color2, color1, smoothstep(0.0, 0.7, vLife));
    vec3 possessedLight = possessionColor * smoothstep(0.0, 0.32, vLife);
    outgoingLight = mix(outgoingLight, possessedLight, vPossession);

    // chunk(shadowmap_fragment);

    outgoingLight *= shadowMask;//pow(shadowMask, vec3(0.75));

    // chunk(fog_fragment);
    // chunk(linear_to_gamma_fragment);

    gl_FragColor = vec4( outgoingLight, 1.0 );

}
