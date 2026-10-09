'use strict';

var should = require('should');
var mongoose = require('mongoose');

var setUpTestDb = require('../unit-utils').setUpTestDb;
var participantLinks = require('./participant-links');
var ParticipantLink = require('../models/participant-link-model').ParticipantLink;

describe('Engine - Participant links', function() {
  function remember(mw, pId, params) {
    return new Promise(function(resolve) {
      participantLinks.remember(mw, pId, params, function(err, stored, remembered) {
        resolve({ err: err, params: stored, remembered: remembered });
      });
    });
  }

  var active, test;

  beforeEach(async function() {
    await setUpTestDb();
    await ParticipantLink.init(); // the unique index
    active = { _id: new mongoose.Types.ObjectId(), status: 'active', code: 'ACT' };
    test = { _id: new mongoose.Types.ObjectId(), status: 'test', code: 'TST' };
  });

  describe('cleanParams', function() {
    it('keeps every name/value pair, also unknown ones', function() {
      participantLinks.cleanParams({ fclass: 'Upper', token: 'x.y$z', 'a.b': '1' })
        .should.deepEqual({ fclass: 'Upper', token: 'x.y$z', 'a.b': '1' });
    });

    it('turns values into strings and takes the first of a name given twice', function() {
      participantLinks.cleanParams({ n: 5, flag: '', twice: ['a', 'b'], none: null })
        .should.deepEqual({ n: '5', flag: '', twice: 'a', none: '' });
    });

    it('ignores what is not a list of parameters', function() {
      participantLinks.cleanParams(null).should.deepEqual({});
      participantLinks.cleanParams('fclass=Upper').should.deepEqual({});
      participantLinks.cleanParams(['a']).should.deepEqual({});
      participantLinks.cleanParams({ nested: { a: 1 } }).should.deepEqual({});
    });

    it('limits how much a link can store', function() {
      var many = {};
      for (var i = 0; i < 80; i++) many['p' + i] = 'v';
      Object.keys(participantLinks.cleanParams(many)).length.should.equal(50);
      var long = participantLinks.cleanParams({ v: new Array(3000).join('x') });
      long.v.length.should.equal(2000);
    });
  });

  describe('fisherParams', function() {
    it('reads class, display name and advantage like the game page does', function() {
      participantLinks.fisherParams({ fclass: 'Upper', pdisplay: 'Ann', fhasadvantage: 'true' })
        .should.deepEqual({ pDisplay: 'Ann', fClass: 'Upper', fHasAdvantage: true });
      participantLinks.fisherParams({ fhasadvantage: '' }).fHasAdvantage.should.equal(true);
      participantLinks.fisherParams({ fhasadvantage: '1' }).fHasAdvantage.should.equal(true);
      participantLinks.fisherParams({ fhasadvantage: 'false' }).fHasAdvantage.should.equal(false);
      participantLinks.fisherParams({ fhasadvantage: 'yes' }).fHasAdvantage.should.equal(false);
      participantLinks.fisherParams({}).fHasAdvantage.should.equal(false);
    });
  });

  describe('remember', function() {
    it('stores the first link of a participant in an active microworld', async function() {
      var first = await remember(active, 'p1',
        { lang: 'en', expid: 'ACT', partid: 'p1', fclass: 'Lower', fhasadvantage: 'false', token: 'abc' });
      first.remembered.should.equal(true);
      // The page's own address (lang, mwid, pid) is not part of it
      first.params.should.deepEqual({ expid: 'ACT', partid: 'p1', fclass: 'Lower', fhasadvantage: 'false', token: 'abc' });
    });

    it('gives a later visit with an edited link the first link', async function() {
      await remember(active, 'p1', { fclass: 'Lower', fhasadvantage: 'false' });
      var edited = await remember(active, 'p1', { fclass: 'Upper', fhasadvantage: 'true' });
      edited.remembered.should.equal(true);
      edited.params.should.deepEqual({ fclass: 'Lower', fhasadvantage: 'false' });
    });

    it('gives a visit with the cleaned address (or another browser) the first link', async function() {
      await remember(active, 'p1', { fclass: 'Lower', token: 'abc' });
      var later = await remember(active, 'p1', { lang: 'en', mwid: String(active._id), pid: 'p1' });
      later.params.should.deepEqual({ fclass: 'Lower', token: 'abc' });
    });

    it('logs an edited link, but not a shortened one', async function() {
      var winston = require('winston');
      var warn = winston.warn;
      var warned = [];
      winston.warn = function(msg) { warned.push(msg); };
      try {
        await remember(active, 'p1', { expid: 'ACT', partid: 'p1', fhasadvantage: 'false' });
        await remember(active, 'p1', { lang: 'en', expid: 'ACT', partid: 'p1' });
        warned.length.should.equal(0);
        await remember(active, 'p1', { expid: 'ACT', partid: 'p1', fhasadvantage: 'true' });
        warned.length.should.equal(1);
        warned[0].should.match(/different link/);
      } finally {
        winston.warn = warn;
      }
    });

    it('keeps participants and microworlds apart', async function() {
      await remember(active, 'p1', { fclass: 'Lower' });
      (await remember(active, 'p2', { fclass: 'Upper' })).params.fclass.should.equal('Upper');
      var other = { _id: new mongoose.Types.ObjectId(), status: 'active', code: 'OTH' };
      (await remember(other, 'p1', { fclass: 'Upper' })).params.fclass.should.equal('Upper');
    });

    it('stores nothing for a test microworld, so test IDs can be reused', async function() {
      var first = await remember(test, 'p1', { fclass: 'Lower' });
      first.remembered.should.equal(false);
      var second = await remember(test, 'p1', { lang: 'en', fclass: 'Upper' });
      second.params.should.deepEqual({ fclass: 'Upper' });
      (await ParticipantLink.countDocuments({})).should.equal(0);
    });

    it('keeps one link when two first visits arrive at once', async function() {
      var both = await Promise.all([
        remember(active, 'p1', { fclass: 'Lower' }),
        remember(active, 'p1', { fclass: 'Upper' }),
      ]);
      both[0].params.fclass.should.equal(both[1].params.fclass);
      (await ParticipantLink.countDocuments({})).should.equal(1);
    });

    it('plays on the given link when there is no microworld', async function() {
      var result = await remember(null, 'p1', { fclass: 'Upper' });
      result.remembered.should.equal(false);
      result.params.should.deepEqual({ fclass: 'Upper' });
    });
  });
});
