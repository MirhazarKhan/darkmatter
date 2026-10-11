uniform sampler2D u_motionTexture;
uniform float u_depthTest;
uniform float u_opacity;
uniform float u_leaning;
uniform float u_fadeStrength;
uniform float u_depthBias;
uniform vec2 u_clipPlanes;
uniform vec2 u_focusRange;
uniform float u_depthStrength;

#pragma glslify: farDepthWeight = require(./depthWeight.glsl)

varying vec3 v_color;
varying float v_ratio;
varying float v_depth;
varying vec2 v_uv;
varying float v_farWeight;

void main() {

    vec4 motion = texture2D( u_motionTexture, v_uv );

    float alpha = smoothstep(0.0, u_leaning, v_ratio) * (1.0 - smoothstep (u_leaning, 1.0, v_ratio));

    alpha = pow(alpha, u_fadeStrength) * u_opacity;
    alpha *= mix(1.0, v_farWeight, u_depthStrength);

    if(alpha < 0.00392157) {
        discard;
    }

    float threshold = v_depth * step(0.0001, motion.z);
    alpha *= max(1.0 - u_depthTest, smoothstep(threshold - u_depthBias, threshold, motion.z));
    // Sparse motion texels carry the actual nearest visible particle's depth.
    // Reject distant streaks over a foreground head without mistaking empty space for it.
    float foreground = step(0.001, motion.a) *
        (1.0 - farDepthWeight(motion, u_clipPlanes, u_focusRange));
    alpha *= 1.0 - foreground * u_depthStrength;

    gl_FragColor = vec4( v_color * alpha, alpha );

}
