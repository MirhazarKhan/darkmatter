exports.chapters = [
    { title: 'A living current.', name: 'Flow', description: 'Move through the field. Every particle follows its own quiet rhythm.' },
    { title: 'Order from motion.', name: 'Orbit', description: 'Thousands of independent paths gather into a single sculptural form.' },
    { title: 'A thought takes shape.', name: 'Spirit', description: 'The current becomes a word. Structure stays alive beneath the surface.' },
    { title: 'A familiar presence.', name: 'Portrait', description: 'Light and shadow resolve into a portrait, drawn entirely with particles.' },
    { title: 'Always becoming.', name: 'Infinity', description: 'The form opens into an endless loop. There is no final shape.' }
];

exports.sample = function (progress) {
    progress = Math.max(0, Math.min(1, Number(progress) || 0));
    var position = progress * (exports.chapters.length - 1);
    var from = Math.min(exports.chapters.length - 1, Math.floor(position));
    var to = Math.min(exports.chapters.length - 1, from + 1);
    var blend = position - from;
    var transition = Math.max(0, Math.min(1, (blend - 0.18) / 0.64));
    var eased = transition * transition * (3 - 2 * transition);
    return {
        progress: progress,
        from: from,
        to: to,
        blend: eased,
        strength: from === 0 ? eased : 1,
        chapter: Math.round(position)
    };
};
