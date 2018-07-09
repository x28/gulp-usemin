var fs = require('fs');
var glob = require('glob');
var path = require('path');
var Vinyl = require('vinyl');
var PluginError = require('plugin-error');

module.exports = function(file, options) {
  options = options || {};

  var startReg = /<!--\s*build:(\w+)(?:(?:\(([^\)]+?)\))?\s+(\/?([^\s]+?))?)?\s*-->/gim;
  var endReg = /<!--\s*endbuild\s*-->/gim;
  var jsReg = /<\s*script\s+.*?src\s*=\s*['"]?([^'"?# ]+).*?><\s*\/\s*script\s*>/gi;
  var cssReg = /<\s*link\s+.*?href\s*=\s*['"]?([^'"?# ]+).*?>/gi;
  var cssMediaReg = /<\s*link\s+.*?media\s*=\s*['"]?([^'"]+).*?>/gi;
  var startCondReg = /<!--\[[^\]]+\]>/gim;
  var endCondReg = /<!\[endif\]-->/gim;

  var basePath = file.base;
  var mainPath = path.dirname(file.path);
  var outputPath = options.outputRelativePath || '';
  var content = String(file.contents);
  var sections = content.split(endReg);
  var blocks = [];
  var cssMediaQuery = null;

  function getFiles(content, reg, alternatePath) {
    var paths = [];
    var files = [];
    cssMediaQuery = null;

    content
      .replace(startCondReg, '')
      .replace(endCondReg, '')
      .replace(/<!--(?:(?:.|\r|\n)*?)-->/gim, function (a) {
        return options.enableHtmlComment ? a : '';
      })
      .replace(reg, function (a, b) {
        var filePath = path.resolve(path.join(
          alternatePath || options.path || mainPath,
          b.replace(/^'|^"/, '').replace(/'$/, '').replace(/"$/, '')
        ));

        if (options.assetsDir)
          filePath = path.resolve(path.join(options.assetsDir, path.relative(basePath, filePath)));

        paths.push(filePath);
      });

    if (reg === cssReg) {
      content.replace(cssMediaReg, function(a, media) {
        media = media.replace(/^'|^"/, '').replace(/'$/, '').replace(/"$/, '');

        if (!cssMediaQuery) {
          cssMediaQuery = media;
        } else {
          if (cssMediaQuery != media)
            throw new PluginError('gulp-usemin', 'incompatible css media query for ' + a + ' detected.');
        }
      });
    }

    for (var i = 0, l = paths.length; i < l; ++i) {
      var filepaths = glob.sync(paths[i]);
      if(filepaths[0] === undefined && !options.skipMissingResources) {
        throw new PluginError('gulp-usemin', 'Path ' + paths[i] + ' not found!');
      } else {
        filepaths.forEach(function (filepath) {
          files.push(new Vinyl({
            path: filepath,
            contents: fs.readFileSync(filepath)
          }));
        });
      }
    }

    return files;
  }

  for (var i = 0, l = sections.length; i < l; ++i) {
    if (sections[i].match(startReg)) {
      var section = sections[i].split(startReg);
      var pipline = section[1];
      var alternatePath = section[2];
      var resourceName = section[3];
      var resourcePath = section[4];
      var resourceHtmlMarkup = section[5];

      blocks.push(section[0]);

      var startCondLine = resourceHtmlMarkup.match(startCondReg);
      var endCondLine = resourceHtmlMarkup.match(endCondReg);
      if (startCondLine && endCondLine)
        blocks.push(startCondLine[0]);

      if (pipline !== 'remove') {
        if (pipline === 'htmlimport'){
          blocks.push({
            type: 'htmlimport',
            nameInHTML: resourceName,
            name: path.join(outputPath || path.relative(basePath, mainPath), resourcePath),
            files: getFiles(resourceHtmlMarkup, options.cssReg || cssReg, alternatePath),
            tasks: options[pipline]
          });

        } else if (pipline === 'inlinejs' || pipline === 'js') {
          if (pipline === 'inlinejs') {
            blocks.push({
              type: 'inlinejs',
              files: getFiles(resourceHtmlMarkup, options.jsReg || jsReg, alternatePath),
              tasks: options[pipline]
            });
          }
          else {
            blocks.push({
              type: 'js',
              nameInHTML: resourceName,
              name: path.join(outputPath || path.relative(basePath, mainPath), resourcePath),
              files: getFiles(resourceHtmlMarkup, options.jsReg || jsReg, alternatePath),
              tasks: options[pipline]
            });
          }

        } else if (pipline === 'inlinecss' || pipline === 'css') {
          if (pipline === 'inlinecss') {
            blocks.push({
              type: 'inlinecss',
              files: getFiles(resourceHtmlMarkup, options.cssReg || cssReg, alternatePath),
              tasks: options[pipline],
              mediaQuery: cssMediaQuery
            });
          }
          else {
            blocks.push({
              type: 'css',
              nameInHTML: resourceName,
              name: path.join(outputPath || path.relative(basePath, mainPath), resourcePath),
              files: getFiles(resourceHtmlMarkup, options.cssReg || cssReg, alternatePath),
              tasks: options[pipline],
              mediaQuery: cssMediaQuery
            });
          }
        } else {
          throw new PluginError('gulp-usemin', 'no matching pipeline "' + pipeline + '" found.');
        }
      }

      if (startCondLine && endCondLine)
        blocks.push(endCondLine[0]);
    } else
      blocks.push(sections[i]);
  }

  return blocks;
};
