# big boring system

[![Dependency Status](https://david-dm.org/bigboringsystem/bbs2.svg)](https://david-dm.org/bigboringsystem/bbs2)  [![devDependency Status](https://david-dm.org/bigboringsystem/bbs2/dev-status.svg)](https://david-dm.org/bigboringsystem/bbs2#info=devDependencies)

## Setup

After cloning the repo, install dependencies and copy the local configuration file:

    npm install
    cp local.json-dist local.json

Create a Twilio account. After you create it, go to https://www.twilio.com/user/account/ to get the SID and Auth Token. Enter these into local.json

Make sure that `twilioNumber` in local.json is the full number obtained
from Twilio including the country code. For example, a United States based
number needs to be prefixed by '1' and the area code, i.e. "1NNNNNNNNNN".

Then start the server:

    npm start

Visit http://localhost:3000 in your browser.

