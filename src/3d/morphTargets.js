var THREE = require('three');
var settings = require('../core/settings');

var TWO_PI = Math.PI * 2;
var CENTER_Y = 50;
var _textures = [];
var _cinematicTextures = Object.create(null);
var _width;
var _height;
var _amount;
var _basis;
var _seed;

exports.labels = ['Flow', 'Orbit', 'SPIRIT', 'Portrait', 'Infinity'];
exports.sceneMap = { flow: 0, orbit: 1, title: 2, portrait: 3, infinity: 4 };
exports.portraitSource = 'abstract';
exports.init = init;
exports.getTexture = getTexture;
exports.getCinematicTexture = getCinematicTexture;
exports.setPortrait = setPortrait;
exports.dispose = dispose;

function init() {
    if (_textures.length) return _textures;
    _ensureLayout();

    _textures[0] = _makeTexture(_sphere(155));
    _textures[1] = _makeTexture(_sphere(130));
    _textures[2] = _makeTexture(_planar(_titleSampler(), 390, 100, 5));
    _textures[3] = _makeTexture(_planar(_abstractPortraitSampler(), 230, 280, 14));
    _textures[4] = _makeTexture(_infinity);
    exports.portraitSource = 'abstract';
    return _textures;
}

function _ensureLayout() {
    if (_basis) return;
    _width = settings.simulatorTextureWidth;
    _height = settings.simulatorTextureHeight;
    _amount = _width * _height;
    _basis = _cameraBasis();
}

function getCinematicTexture(key) {
    _ensureLayout();
    if (_cinematicTextures[key]) return _cinematicTextures[key];
    var writePosition;
    if (key === 'name') {
        writePosition = _planar(_cinematicTitleSampler(['MIRHAZAR', 'KHAN']), 460, 160, 3);
    } else if (key === 'darkMatter') {
        writePosition = _planar(_cinematicTitleSampler(['DARK', 'MATTER']), 420, 200, 4);
    } else if (key === 'finalTitle') {
        writePosition = _finalTitle(_finalTitleSampler());
    } else if (key === 'halo') {
        writePosition = _halo;
    } else if (key === 'ascendingHalo') {
        writePosition = _ascendingHalo;
    } else {
        throw new Error('Unknown cinematic particle target: ' + key);
    }
    _cinematicTextures[key] = _makeTexture(writePosition, key === 'finalTitle');
    return _cinematicTextures[key];
}

function getTexture(index) {
    init();
    index = Math.max(0, Math.min(4, index | 0));
    return _textures[index];
}

function setPortrait(image) {
    init();
    var canvas = _canvas(180, 220);
    var sampler;
    var source = 'abstract';
    if (canvas && image) {
        var imageWidth = image.naturalWidth || image.videoWidth || image.width;
        var imageHeight = image.naturalHeight || image.videoHeight || image.height;
        if (!(imageWidth > 0 && imageHeight > 0)) {
            throw new Error('The portrait image has no usable dimensions.');
        }
        var context = canvas.getContext('2d');
        var aspect = canvas.width / canvas.height;
        var cropHeight = Math.min(imageHeight, imageWidth / aspect);
        if (imageWidth / imageHeight > 1.1) cropHeight *= 0.74;
        var cropWidth = cropHeight * aspect;
        var cropX = (imageWidth - cropWidth) * 0.5;
        var cropY = (imageHeight - cropHeight) * 0.06;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, cropX, cropY, cropWidth, cropHeight,
            0, 0, canvas.width, canvas.height);
        sampler = _samplePortrait(canvas);
        if (sampler) source = 'image';
    }
    sampler = sampler || _abstractPortraitSampler();
    var texture = _makeTexture(_planar(sampler, 230, 280, 14));
    var previousTexture = _textures[3];
    _textures[3] = texture;
    exports.portraitSource = source;
    if (previousTexture && previousTexture.dispose) previousTexture.dispose();
    return texture;
}

function dispose() {
    for (var i = 0; i < _textures.length; i++) {
        if (_textures[i] && _textures[i].dispose) _textures[i].dispose();
    }
    for (var key in _cinematicTextures) {
        if (_cinematicTextures[key] && _cinematicTextures[key].dispose) _cinematicTextures[key].dispose();
    }
    _textures = [];
    _cinematicTextures = Object.create(null);
    _basis = null;
    exports.portraitSource = 'abstract';
}

function _halo(data, offset, u, v, w, t) {
    // A tilted accretion ring: most particles trace the bright inner edge,
    // while fine spiral arms give the silhouette depth as it begins to turn.
    var arm = Math.floor(u * 3);
    var path = u * 3 - arm;
    var angle = path * TWO_PI + arm * TWO_PI / 3;
    var edge = Math.pow(v, 2.6);
    var radius = 118 + edge * 56 + Math.sin(angle * 2 + arm) * 5;
    var spiral = (t - 0.5) * 0.35 + edge * 0.65;
    angle += spiral;
    var x = Math.cos(angle) * radius;
    var y = Math.sin(angle) * radius * 0.46;
    var z = Math.sin(angle) * radius * 0.48 + (w - 0.5) * (4 + edge * 18);
    _writeFacing(data, offset, x, y, z);
}

function _ascendingHalo(data, offset, u, v, w, t) {
    _halo(data, offset, u, v, w, t);
    // Keep the opening halo intact; this target tilts its upper surface toward the rising camera.
    var normal = _basis.normal;
    var reflection = 2 * (data[offset] * normal[0] + (data[offset + 1] - CENTER_Y) * normal[1] + data[offset + 2] * normal[2]);
    data[offset] -= reflection * normal[0];
    data[offset + 1] -= reflection * normal[1];
    data[offset + 2] -= reflection * normal[2];
}

function _makeTexture(writePosition, preserveMetadata) {
    var data = new Float32Array(_amount * 4);
    // Each scene consumes the same four random values for every particle.
    // A particle therefore keeps its identity across morphs and uploads.
    _seed = 17318291;
    for (var i = 0; i < _amount; i++) {
        var offset = i * 4;
        writePosition(data, offset, _random(), _random(), _random(), _random());
        if (!preserveMetadata) data[offset + 3] = 1;
    }
    var texture = new THREE.DataTexture(data, _width, _height, THREE.RGBAFormat, THREE.FloatType);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.needsUpdate = true;
    return texture;
}

function _random() {
    _seed = (_seed * 1664525 + 1013904223) >>> 0;
    return _seed / 4294967296;
}

function _sphere(radius) {
    return function (data, offset, u, v, w) {
        var y = 1 - 2 * u;
        var ring = Math.sqrt(Math.max(0, 1 - y * y));
        var angle = v * TWO_PI;
        var r = radius * (0.96 + 0.04 * w);
        data[offset] = Math.cos(angle) * ring * r;
        data[offset + 1] = CENTER_Y + y * r;
        data[offset + 2] = Math.sin(angle) * ring * r;
    };
}

function _infinity(data, offset, u, v, w) {
    var angle = u * TWO_PI;
    var tubeAngle = v * TWO_PI;
    var tangentX = 155 * Math.cos(angle);
    var tangentY = 130 * Math.cos(angle * 2);
    var tangentLength = Math.sqrt(tangentX * tangentX + tangentY * tangentY);
    var tubeRadius = 13 * (0.8 + 0.2 * w);
    var crossOffset = Math.cos(tubeAngle) * tubeRadius;
    var x = 155 * Math.sin(angle) - tangentY / tangentLength * crossOffset;
    var y = 65 * Math.sin(angle * 2) + tangentX / tangentLength * crossOffset;
    var z = 30 * Math.cos(angle) + Math.sin(tubeAngle) * tubeRadius;
    _writeFacing(data, offset, x, y, z);
}

function _planar(sampler, width, height, thickness) {
    return function (data, offset, u, v, w, t) {
        var low = 0;
        var high = sampler.weights.length - 1;
        var target = u * sampler.total;
        while (low < high) {
            var middle = (low + high) >> 1;
            if (sampler.weights[middle] < target) low = middle + 1;
            else high = middle;
        }
        var pixel = low * 3;
        var x = ((sampler.points[pixel] + v) / sampler.width - 0.5) * width;
        var y = (0.5 - (sampler.points[pixel + 1] + w) / sampler.height) * height;
        var z = (t - 0.5) * thickness + sampler.points[pixel + 2] * thickness * 0.35;
        _writeFacing(data, offset, x, y, z);
    };
}

function _writeFacing(data, offset, x, y, z) {
    data[offset] = _basis.right[0] * x + _basis.up[0] * y + _basis.normal[0] * z;
    data[offset + 1] = CENTER_Y + _basis.right[1] * x + _basis.up[1] * y + _basis.normal[1] * z;
    data[offset + 2] = _basis.right[2] * x + _basis.up[2] * y + _basis.normal[2] * z;
}

function _cameraBasis() {
    var camera = settings.camera;
    var elements = camera && camera.matrixWorld && camera.matrixWorld.elements;
    var position = camera && camera.position;
    if (elements && position &&
        Math.abs(elements[12] - position.x) < 0.001 &&
        Math.abs(elements[13] - position.y) < 0.001 &&
        Math.abs(elements[14] - position.z) < 0.001) {
        return {
            right: [elements[0], elements[1], elements[2]],
            up: [elements[4], elements[5], elements[6]],
            normal: [elements[8], elements[9], elements[10]]
        };
    }
    // Initialization can precede OrbitControls' first matrix update.
    var x = position ? position.x : 0;
    var y = position ? position.y - CENTER_Y : 0;
    var z = position ? position.z : 1;
    var length = Math.sqrt(x * x + y * y + z * z);
    if (length < 0.0001) {
        z = 1;
        length = 1;
    }
    var normal = [x / length, y / length, z / length];
    var rightLength = Math.sqrt(normal[0] * normal[0] + normal[2] * normal[2]);
    var right = rightLength > 0.0001 ? [normal[2] / rightLength, 0, -normal[0] / rightLength] : [1, 0, 0];
    var up = [
        normal[1] * right[2] - normal[2] * right[1],
        normal[2] * right[0] - normal[0] * right[2],
        normal[0] * right[1] - normal[1] * right[0]
    ];
    return { right: right, up: up, normal: normal };
}

function _canvas(width, height) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas.getContext && canvas.getContext('2d') ? canvas : null;
}

function _sampleCanvas(canvas) {
    var pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    var points = [];
    var weights = [];
    var total = 0;
    for (var i = 0; i < canvas.width * canvas.height; i++) {
        var offset = i * 4;
        var alpha = pixels[offset + 3] / 255;
        var luminance = (pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722) / 255;
        var darkness = (1 - luminance) * alpha;
        if (darkness < 0.08) continue;
        total += darkness * darkness;
        points.push(i % canvas.width, Math.floor(i / canvas.width), darkness);
        weights.push(total);
    }
    if (!weights.length || !(total > 0)) return null;
    return { points: new Float32Array(points), weights: new Float32Array(weights), total: total, width: canvas.width, height: canvas.height };
}

function _samplePortrait(canvas) {
    var width = canvas.width;
    var height = canvas.height;
    var pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
    var luminance = new Float32Array(width * height);
    var maxDarkness = 0;
    var i;
    for (i = 0; i < luminance.length; i++) {
        var offset = i * 4;
        var alpha = pixels[offset + 3] / 255;
        var value = (pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722) / 255;
        luminance[i] = 1 - (1 - value) * alpha;
        maxDarkness = Math.max(maxDarkness, 1 - luminance[i]);
    }
    if (maxDarkness < 0.08) return null;

    var points = [];
    var weights = [];
    var total = 0;
    for (var y = 0; y < height; y++) {
        var normalizedY = y / height;
        // An anonymous bust-shaped mask prevents a studio backdrop becoming a rectangle.
        var halfWidth;
        if (normalizedY < 0.66) {
            var headY = (normalizedY - 0.35) / 0.35;
            halfWidth = Math.sqrt(Math.max(0, 1 - headY * headY)) * 0.29;
        } else if (normalizedY < 0.75) {
            halfWidth = 0.19;
        } else {
            halfWidth = 0.3 + (normalizedY - 0.75) * 0.65;
        }
        var backgroundLeft = (y * width + 3) * 4;
        var backgroundRight = (y * width + width - 4) * 4;
        for (var x = 0; x < width; x++) {
            var normalizedX = Math.abs((x + 0.5) / width - 0.5);
            var mask = Math.max(0, Math.min(1, (halfWidth - normalizedX) * 24));
            mask *= Math.max(0, Math.min(1, (1 - normalizedY) * 10));
            if (mask <= 0) continue;
            i = y * width + x;
            offset = i * 4;
            alpha = pixels[offset + 3] / 255;
            if (alpha < 0.05) continue;
            var darkness = 1 - luminance[i];
            var dx = luminance[y * width + Math.min(width - 1, x + 2)] - luminance[y * width + Math.max(0, x - 2)];
            var dy = luminance[Math.min(height - 1, y + 2) * width + x] - luminance[Math.max(0, y - 2) * width + x];
            var edge = Math.sqrt(dx * dx + dy * dy);
            var leftDifference = _colorDifference(pixels, offset, backgroundLeft);
            var rightDifference = _colorDifference(pixels, offset, backgroundRight);
            var difference = Math.min(leftDifference, rightDifference);
            var foreground = Math.max(0.08, Math.min(1, difference * 8));
            var facePriority = normalizedY < 0.66 ? 1.5 : 0.55;
            var weight = (0.018 + darkness * darkness * 0.7 + edge * 1.6 + difference * 0.25) * mask * foreground * facePriority * alpha;
            if (weight < 0.002) continue;
            total += weight;
            points.push(x, y, darkness);
            weights.push(total);
        }
    }
    if (!weights.length || !(total > 0)) return null;
    return { points: new Float32Array(points), weights: new Float32Array(weights), total: total, width: width, height: height };
}

function _colorDifference(pixels, offset, backgroundOffset) {
    var red = pixels[offset] - pixels[backgroundOffset];
    var green = pixels[offset + 1] - pixels[backgroundOffset + 1];
    var blue = pixels[offset + 2] - pixels[backgroundOffset + 2];
    return Math.sqrt(red * red + green * green + blue * blue) / 441.673;
}

function _titleSampler() {
    var canvas = _canvas(768, 200);
    if (canvas) {
        var context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#111111';
        context.font = '900 158px Arial, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('SPIRIT', canvas.width * 0.5, canvas.height * 0.53, canvas.width * 0.95);
        var sampler = _sampleCanvas(canvas);
        if (sampler) return sampler;
    }
    return _blockTitleSampler();
}

function _cinematicTitleSampler(lines) {
    var canvas = _canvas(768, 320);
    if (canvas) {
        var context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#111111';
        context.font = '900 142px Arial, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        for (var i = 0; i < lines.length; i++) {
            context.fillText(lines[i], canvas.width * 0.5, 80 + i * 154, canvas.width * 0.94);
        }
        var sampler = _sampleCanvas(canvas);
        if (sampler) return sampler;
    }
    return _bitmapTextSampler(lines);
}

function _finalTitleSampler() {
    var canvas = _canvas(1120, 600);
    if (canvas) {
        var context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#080808';
        context.font = '900 280px Impact, "Arial Black", Arial, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'alphabetic';
        var lines = ['DARK', 'MATTER'];
        for (var i = 0; i < lines.length; i++) {
            var metrics = context.measureText(lines[i]);
            var ascent = metrics.actualBoundingBoxAscent || 220;
            var descent = metrics.actualBoundingBoxDescent || 1;
            context.save();
            context.translate(canvas.width * 0.5, 18 + i * 298);
            // Equal cap height, a wider lower line, and tight leading match the
            // monumental two-line reference without relying on a web font.
            context.scale((i ? 1052 : 800) / metrics.width, 266 / (ascent + descent));
            context.fillText(lines[i], 0, ascent);
            context.restore();
        }
        var sampler = _sampleCanvas(canvas);
        if (sampler) return sampler;
    }
    return _bitmapTextSampler(['DARK', 'MATTER']);
}

function _finalTitle(sampler) {
    return function (data, offset, u, v, w, t) {
        if (u >= 0.84) {
            // A sparse surrounding atmosphere shares the same GPU simulation
            // and particle life as the lettering, rather than a second cloud.
            var lane = (u - 0.84) / 0.16;
            data[offset] = (v - 0.5) * 880;
            data[offset + 1] = CENTER_Y + (w - 0.5) * 470;
            data[offset + 2] = (t - 0.5) * 130 - lane * 18;
            data[offset + 3] = 0;
            return;
        }
        var low = 0;
        var high = sampler.weights.length - 1;
        var target = u / 0.84 * sampler.total;
        while (low < high) {
            var middle = (low + high) >> 1;
            if (sampler.weights[middle] < target) low = middle + 1;
            else high = middle;
        }
        var pixel = low * 3;
        data[offset] = ((sampler.points[pixel] + v) / sampler.width - 0.5) * 560;
        data[offset + 1] = CENTER_Y + (0.5 - (sampler.points[pixel + 1] + w) / sampler.height) * 300;
        data[offset + 2] = (t - 0.5) * 5;
        data[offset + 3] = 1;
    };
}

function _bitmapTextSampler(lines) {
    var glyphs = {
        A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
        D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
        E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
        H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
        I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
        K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
        M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
        N: ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
        R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
        T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
        Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111']
    };
    var width = 1;
    var height = lines.length * 9 - 2;
    var line;
    for (line = 0; line < lines.length; line++) width = Math.max(width, lines[line].length * 6 - 1);
    var points = [];
    var weights = [];
    for (line = 0; line < lines.length; line++) {
        var left = (width - (lines[line].length * 6 - 1)) * 0.5;
        for (var letter = 0; letter < lines[line].length; letter++) {
            var glyph = glyphs[lines[line].charAt(letter)];
            if (!glyph) continue;
            for (var y = 0; y < 7; y++) {
                for (var x = 0; x < 5; x++) {
                    if (glyph[y].charAt(x) === '1') {
                        points.push(left + letter * 6 + x, line * 9 + y, 1);
                        weights.push(weights.length + 1);
                    }
                }
            }
        }
    }
    return { points: new Float32Array(points), weights: new Float32Array(weights), total: weights.length, width: width, height: height };
}

function _blockTitleSampler() {
    var letters = [
        ['11111', '10000', '10000', '11111', '00001', '00001', '11111'],
        ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
        ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
        ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
        ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
        ['11111', '00100', '00100', '00100', '00100', '00100', '00100']
    ];
    var points = [];
    var weights = [];
    for (var letter = 0; letter < letters.length; letter++) {
        for (var y = 0; y < 7; y++) {
            for (var x = 0; x < 5; x++) {
                if (letters[letter][y].charAt(x) === '1') {
                    points.push(letter * 6 + x, y, 1);
                    weights.push(weights.length + 1);
                }
            }
        }
    }
    return { points: new Float32Array(points), weights: new Float32Array(weights), total: weights.length, width: 35, height: 7 };
}

function _abstractPortraitSampler() {
    // A stylized anonymous bust; this is never represented as an uploaded likeness.
    var width = 180;
    var height = 220;
    var points = [];
    var weights = [];
    var total = 0;
    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
            var nx = (x - 90) / 51;
            var ny = (y - 78) / 69;
            var face = nx * nx + ny * ny < 1 && y < 144;
            var neck = x > 68 && x < 112 && y >= 130 && y < 176;
            var shoulders = y > 158 && Math.pow((x - 90) / 86, 2) + Math.pow((y - 217) / 58, 2) < 1;
            if (!face && !neck && !shoulders) continue;
            var darkness = 0.55;
            if (face) {
                darkness = 0.32 + 0.42 * Math.abs(nx) + 0.14 * Math.max(0, ny);
                var eyes = y > 69 && y < 76 && ((x > 58 && x < 80) || (x > 100 && x < 122));
                var nose = x > 84 && x < 92 && y > 77 && y < 107;
                var mouth = y > 116 && y < 121 && x > 72 && x < 108;
                if (eyes || mouth) darkness = 0.96;
                if (nose) darkness = 0.12;
            }
            total += darkness * darkness;
            points.push(x, y, darkness);
            weights.push(total);
        }
    }
    return { points: new Float32Array(points), weights: new Float32Array(weights), total: total, width: width, height: height };
}
