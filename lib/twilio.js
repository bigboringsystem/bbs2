/*eslint no-process-exit: 0 */
'use strict';

const twilio = require('twilio');

let mock = function () {
  return {
    sendMessage: function (options, next) { next(); }
  };
};

const isTest = process.env.NODE_ENV === 'test';

if (isTest) {
  module.exports = mock;
} else {
  module.exports = function (sid, token) {
    if (!sid || !token) {
      console.error('\nTwilio Not Configured:');
      console.error('Please add twilioSID and twilioToken to your local.json config or else use `npm run dev` to run a local dev server instead\n');
      process.exit();
    }
    return twilio(sid, token);
  };
}
