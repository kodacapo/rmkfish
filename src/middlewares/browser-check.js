'use strict';

// Opera Mini, in the data-saving mode most of its users run, builds pages on
// Opera's servers and can't keep the live connection FISH needs, so a
// participant would get stuck partway into the study. Such visitors get a
// plain page in their language, asking them to open the link in another
// browser. Their link is stored first (src/engine/participant-links.js) and
// they are sent to a cleaned address, so the link they copy is short, shows
// no conditions, and can't change them.

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var log = require('winston');

var Microworld = require('../models/microworld-model').Microworld;
var participantLinks = require('../engine/participant-links');

// The participants' translations live in a browser script; read them from there
var langs = (function() {
  var sandbox = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../public/js/localization.js'), 'utf8'), sandbox);
  return sandbox.langs;
})();

exports.isOperaMini = function(req) {
  var ua = req.headers['user-agent'] || '';
  // Opera's servers pass the phone's own user agent in this header
  return /Opera Mini|OPiOS/.test(ua) || !!req.headers['x-operamini-phone-ua'];
};

exports.messagesFor = function(lang) {
  lang = typeof lang === 'string' ? lang.toLowerCase() : '';
  if (!langs[lang]) lang = 'en';
  return { lang: lang, title: langs[lang].login_otherBrowser, message: langs[lang].login_operaMini };
};

// The microworld and participant of a link to the access page (expid,
// partid) or to the game page (mwid, pid); cb(mw or null, pId)
function findLinkOwner(query, cb) {
  var pId = query.pid || query.partid;
  if (typeof pId !== 'string' || !pId) return cb(null);
  var done = function(err, mw) { cb(err ? null : mw, pId); };
  if (typeof query.mwid === 'string') return Microworld.findById(query.mwid, done);
  if (typeof query.expid === 'string') {
    return Microworld.findOne({ code: query.expid.trim().toUpperCase(), status: { $in: ['test', 'active'] } }, done);
  }
  return cb(null);
}

// The address the participant should copy once their link is stored: only
// what finds the study and the participant, so a shorter link, with no
// conditions in it to see or change
var CLEAN_PARAMS = { '/fish': ['lang', 'mwid', 'pid'] };
var CLEAN_ACCESS_PARAMS = ['lang', 'expid', 'partid'];

exports.cleanAddress = function(reqPath, query) {
  var keep = CLEAN_PARAMS[reqPath] || CLEAN_ACCESS_PARAMS;
  var parts = keep.filter(function(name) {
    return typeof query[name] === 'string';
  }).map(function(name) {
    return name + '=' + encodeURIComponent(query[name]);
  });
  var isClean = Object.keys(query).every(function(name) { return keep.indexOf(name) !== -1; });
  return isClean ? null : reqPath + (parts.length ? '?' + parts.join('&') : '');
};

exports.turnAwayOperaMini = function(req, res, next) {
  if (!exports.isOperaMini(req)) return next();
  var page = exports.messagesFor(req.query.lang);
  findLinkOwner(req.query, function(mw, pId) {
    participantLinks.remember(mw, pId, req.query, function(_, params, remembered) {
      var clean = remembered && exports.cleanAddress(req.path, req.query);
      if (clean) return res.redirect(302, clean);
      log.info('Opera Mini turned away from ' + req.path);
      res.render('other-browser.pug', page);
    });
  });
};
