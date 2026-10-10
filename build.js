global.Promise = require('pinkie-promise');
const browserify = require('browserify');
const fs = require('fs');
const UglifyJS = require('uglify-js');

Promise.all(['index.js'].map(runBuild)).then(function () {
  console.log("Finished");
}).catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});

function runBuild (f) {
  return new Promise(function (resolve, reject) {
    console.log('Bundling', f);
    var b = browserify('src/' + f, {
      debug: false,
      // noparse: [ 'three' ]
    });
    // b.transform(require('babelify').configure({ presets: 'es2015' }));
    b.plugin(require('bundle-collapser/plugin'));
    var transforms = [['glslify', { global: true }]];
    transforms.forEach(function (t) {
      b.transform(t);
    });
    b.bundle(function (err, src) {
      if (err) return reject(err);
      console.log('Compressing', f);
      var result;
      try {
        result = UglifyJS.minify(src.toString(), { fromString: true });
        if (result.error) return reject(result.error);
        if (typeof result.code !== 'string') return reject(new Error('Minification produced no JavaScript for ' + f));
      } catch (minifyError) {
        return reject(minifyError);
      }
      console.log('Writing', f);
      fs.writeFile('app/js/' + f, result.code, function (err) {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}
