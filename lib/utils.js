'use strict';

const twitter = require('twitter-text');

exports.merge = function (objA, objB) {
  for (let key in objB) {
    objA[key] = objB[key];
  }

  return objA;
};

exports.autoLink = function (text, options) {
  if (text && text.toString().trim().length > 0) {
    if (!options) {
      options = {};
    }

    options.htmlEscapeNonEntities = true;
    let entities = twitter.extractEntitiesWithIndices(text, { extractUrlsWithoutProtocol: true });
    return twitter.autoLinkEntities(text, entities, options).replace(/&amp;/gi, '&');
  }
  return '';
};
