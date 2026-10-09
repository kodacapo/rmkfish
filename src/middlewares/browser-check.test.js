const should = require('should');
const request = require('supertest');

const app = require('../app').app;
const Microworld = require('../models/microworld-model').Microworld;
const ParticipantLink = require('../models/participant-link-model').ParticipantLink;
const setUpTestDb = require('../unit-utils').setUpTestDb;
const browserCheck = require('./browser-check');

const OPERA_MINI = 'Opera/9.80 (Android; Opera Mini/36.2.2254/119.132; U; id) Presto/2.12.423 Version/12.16';
const CHROME = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36';

describe('Middlewares - Browser check', () => {
  describe('isOperaMini', () => {
    const req = (headers) => ({ headers: headers });

    it('recognises Opera Mini by its user agent or its forwarding header', () => {
      browserCheck.isOperaMini(req({ 'user-agent': OPERA_MINI })).should.equal(true);
      browserCheck.isOperaMini(req({ 'user-agent': 'Mozilla/5.0 (iPhone) OPiOS/16.0.14 Mobile Safari' })).should.equal(true);
      browserCheck.isOperaMini(req({ 'user-agent': CHROME, 'x-operamini-phone-ua': CHROME })).should.equal(true);
    });

    it('lets other browsers through, Opera for Android included', () => {
      browserCheck.isOperaMini(req({ 'user-agent': CHROME })).should.equal(false);
      browserCheck.isOperaMini(req({ 'user-agent': CHROME + ' OPR/89.0.4447.83' })).should.equal(false);
      browserCheck.isOperaMini(req({})).should.equal(false);
    });
  });

  describe('messagesFor', () => {
    it('speaks the participant\'s language, English when unknown', () => {
      browserCheck.messagesFor('DE').lang.should.equal('de');
      browserCheck.messagesFor('de').message.should.match(/anderen Browser/);
      browserCheck.messagesFor('xx').lang.should.equal('en');
      browserCheck.messagesFor(undefined).message.should.match(/another browser/);
    });
  });

  describe('cleanAddress', () => {
    it('keeps what finds the study and the participant', () => {
      browserCheck.cleanAddress('/', { lang: 'en', expid: 'X', partid: 'p 1', fclass: 'Lower' })
        .should.equal('/?lang=en&expid=X&partid=p%201');
      browserCheck.cleanAddress('/fish', { mwid: 'm', pid: 'p', fhasadvantage: '' })
        .should.equal('/fish?mwid=m&pid=p');
    });

    it('returns nothing when the address is already clean', () => {
      should.not.exist(browserCheck.cleanAddress('/', { lang: 'en', expid: 'X', partid: 'p' }));
      should.not.exist(browserCheck.cleanAddress('/fish', {}));
    });
  });

  describe('participant pages', () => {
    let mw;

    beforeEach(async () => {
      await setUpTestDb();
      await ParticipantLink.init();
      mw = await Microworld.create({
        name: 'Opera Mini test', code: 'OPMINI', status: 'active', dateCreated: new Date(), params: {},
      });
    });

    it('shows Opera Mini the "other browser" page instead of the access page', async () => {
      const res = await request(app).get('/?lang=fr').set('User-Agent', OPERA_MINI);
      res.statusCode.should.equal(200);
      res.text.should.match(/un autre navigateur/);
      res.text.should.not.match(/participant-access\.js/);
    });

    it('shows other browsers the access page', async () => {
      const res = await request(app).get('/?lang=fr').set('User-Agent', CHROME);
      res.text.should.match(/participant-access\.js/);
    });

    it('stores the link first, then sends Opera Mini to a cleaned address to copy', async () => {
      const res = await request(app)
        .get('/?lang=en&expid=opmini&partid=p7&fhasadvantage=false&token=g1')
        .set('User-Agent', OPERA_MINI);
      res.statusCode.should.equal(302);
      res.headers.location.should.equal('/?lang=en&expid=opmini&partid=p7');
      const link = await ParticipantLink.findOne({ microworld: mw._id, participant: 'p7' });
      const params = {};
      link.params.forEach(p => { params[p.name] = p.value; });
      params.should.deepEqual({ expid: 'opmini', partid: 'p7', fhasadvantage: 'false', token: 'g1' });
    });

    it('shows the page at the cleaned address, without logging it as an edited link', async () => {
      const winston = require('winston');
      const warn = winston.warn;
      let warned = '';
      winston.warn = (msg) => { warned += msg; };
      try {
        await request(app).get('/?lang=en&expid=opmini&partid=p7&fhasadvantage=false').set('User-Agent', OPERA_MINI);
        const res = await request(app).get('/?lang=en&expid=opmini&partid=p7').set('User-Agent', OPERA_MINI);
        res.statusCode.should.equal(200);
        res.text.should.match(/does not work in Opera Mini/);
        warned.should.equal('');
      } finally {
        winston.warn = warn;
      }
    });

    it('turns Opera Mini away from the game page too, via its cleaned address', async () => {
      const res = await request(app)
        .get('/fish?lang=en&mwid=' + mw._id + '&pid=p8&fclass=Lower')
        .set('User-Agent', OPERA_MINI);
      res.statusCode.should.equal(302);
      res.headers.location.should.equal('/fish?lang=en&mwid=' + mw._id + '&pid=p8');
      (await ParticipantLink.countDocuments({ participant: 'p8' })).should.equal(1);
    });

    it('keeps the full link in a test microworld, where nothing is stored', async () => {
      await Microworld.create({ name: 'Opera Mini test 2', code: 'OPTEST', status: 'test', dateCreated: new Date(), params: {} });
      const res = await request(app).get('/?lang=en&expid=optest&partid=p9&fclass=Lower').set('User-Agent', OPERA_MINI);
      res.statusCode.should.equal(200);
      res.text.should.match(/does not work in Opera Mini/);
    });

    it('shows the page even when the link names no microworld', async () => {
      const res = await request(app).get('/fish?mwid=not-an-id&pid=p9').set('User-Agent', OPERA_MINI);
      res.statusCode.should.equal(200);
      res.text.should.match(/Opera Mini/);
    });
  });
});
