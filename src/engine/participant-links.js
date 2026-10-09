'use strict';

// Keeps participants from changing their own experimental conditions by
// editing their link (e.g. fhasadvantage=false -> true). In an active
// microworld, the parameters a participant first arrives with are stored, and
// every later visit (a reload, a rejoin, another browser, an edited link) gets
// those stored values instead of its own. The pages then clean the address
// bar down to lang, mwid and pid (participant-access.js, fish.js).
//
// All name/value pairs are kept, also ones FISH doesn't know: the redirect at
// the end of a game fills ${name} in the experimenter's URL with them.
// Test microworlds keep reading the link as is, so test IDs can be reused
// with other parameters.

var log = require('winston');

var ParticipantLink = require('../models/participant-link-model').ParticipantLink;

var MAX_PARAMS = 50;
var MAX_NAME = 100;
var MAX_VALUE = 2000;

// Part of the page's own address, which the pages keep showing
var ADDRESS_PARAMS = ['lang', 'mwid', 'pid'];

// raw: name -> value, from the participant's browser; untrusted
exports.cleanParams = function(raw) {
  var clean = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return clean;
  var count = 0;
  for (var name in raw) {
    if (!Object.prototype.hasOwnProperty.call(raw, name)) continue;
    if (count >= MAX_PARAMS) break;
    if (!name || name.length > MAX_NAME || name === '__proto__') continue;
    var value = raw[name];
    if (Array.isArray(value)) value = value[0]; // a name given twice
    if (value === null || value === undefined) value = '';
    if (['string', 'number', 'boolean'].indexOf(typeof value) === -1) continue;
    clean[name] = String(value).slice(0, MAX_VALUE);
    count++;
  }
  return clean;
};

function withoutAddressParams(params) {
  var rest = {};
  for (var name in params) {
    if (ADDRESS_PARAMS.indexOf(name) === -1) rest[name] = params[name];
  }
  return rest;
}

function toPairs(params) {
  return Object.keys(params).map(function(name) {
    return { name: name, value: params[name] };
  });
}

function fromPairs(pairs) {
  var params = {};
  (pairs || []).forEach(function(p) {
    params[p.name] = p.value;
  });
  return params;
}

// A later link fits the stored one when it says nothing else: the same
// link, or a shortened one (the cleaned address, see browser-check.js)
function fitsStored(given, stored) {
  return Object.keys(given).every(function(k) {
    return Object.prototype.hasOwnProperty.call(stored, k) && stored[k] === given[k];
  });
}

// Same reading of fhasadvantage as fish.js: absent = no; present without a
// value, "true" or "1" = yes
function parseHasAdvantage(params) {
  if (!Object.prototype.hasOwnProperty.call(params, 'fhasadvantage')) return false;
  var value = params.fhasadvantage;
  return value === '' || value === 'true' || value === '1';
}

// The fisher parameters the game uses, from a participant's link parameters
exports.fisherParams = function(params) {
  params = params || {};
  return {
    pDisplay: params.pdisplay,
    fClass: params.fclass,
    fHasAdvantage: parseHasAdvantage(params),
  };
};

// Store the participant's link parameters on their first visit to an active
// microworld; return the stored ones. cb(null, params, remembered): params
// exclude lang, mwid and pid; remembered is false when nothing is stored
// (test microworlds), and params are then the ones given.
exports.remember = function(mw, pId, rawParams, cb) {
  var given = withoutAddressParams(exports.cleanParams(rawParams));
  if (!mw || mw.status !== 'active' || !pId) return cb(null, given, false);
  var participant = String(pId);

  ParticipantLink.findOneAndUpdate(
    { microworld: mw._id, participant: participant },
    { $setOnInsert: { params: toPairs(given), createdAt: new Date() } },
    { upsert: true, new: true },
    function(err, link) {
      if (err) {
        // Two first visits at once: the other one stored the link
        if (err.code === 11000) return exports.remember(mw, pId, rawParams, cb);
        // Better to play on the link as given than not at all
        log.error('Error storing the link of participant ' + participant + ': ' + err);
        return cb(null, given, false);
      }
      var stored = fromPairs(link.params);
      // A link with other parameters is someone's edited or second link
      if (!fitsStored(given, stored)) {
        log.warn('Participant ' + participant + ' of microworld ' + mw.code +
          ' arrived with a different link; keeping the first one');
      }
      return cb(null, stored, true);
    }
  );
};
