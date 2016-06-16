'use strict';

const db = require('./db').register('bans');

exports.hammer = function (phone, next) {
  db.put(phone, phone, (err) => {
    if (err) {
      return next(err);
    }

    next(null, phone);
  });
};

exports.unhammer = function (phone, next) {
  db.del(phone, (err) => {
    if (err) {
      return next(err);
    }

    next(null, true);
  });
};

exports.status = function (phone, next) {
  db.get(phone, (err) => {
    if (err) {
      return next(err);
    }

    next(null, true);
  });
};
