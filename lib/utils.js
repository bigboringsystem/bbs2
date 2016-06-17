'use strict';

const crypto = require('crypto');
const conf = require('../lib/conf');
const twitter = require('twitter-text');
const concat = require('concat-stream');
const Boom = require('boom');

const profiledb = require('./db')('profile');

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
