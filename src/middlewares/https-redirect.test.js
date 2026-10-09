const should = require('should');
const redirect = require('./https-redirect');

describe('Middlewares - HTTPS redirect', () => {
  let res, next;

  function request(hostname, extra) {
    return Object.assign({ hostname: hostname, method: 'GET', originalUrl: '/mw/abc?x=1', headers: {} }, extra);
  }

  beforeEach(() => {
    res = {
      redirect: function(status, url) {
        this.status = status;
        this.url = url;
      },
    };
    next = function() {
      next.called = true;
    };
    next.called = false;
  });

  describe('isEnabled', () => {
    it('is off unless FISH_HTTPS_REDIRECT is set', () => {
      redirect.isEnabled({}).should.equal(false);
      redirect.isEnabled({ FISH_HTTPS_REDIRECT: '' }).should.equal(false);
      redirect.isEnabled({ FISH_HTTPS_REDIRECT: '0' }).should.equal(false);
      redirect.isEnabled({ FISH_HTTPS_REDIRECT: 'false' }).should.equal(false);
      redirect.isEnabled({ FISH_HTTPS_REDIRECT: '1' }).should.equal(true);
      redirect.isEnabled({ FISH_HTTPS_REDIRECT: 'true' }).should.equal(true);
    });
  });

  describe('httpsRedirect', () => {
    it('sends a direct visit to the same page on https, without the port', () => {
      redirect.httpsRedirect(request('rmkfish.duckdns.org'), res, next);
      res.status.should.equal(302);
      res.url.should.equal('https://rmkfish.duckdns.org/mw/abc?x=1');
      next.called.should.equal(false);
    });

    it('keeps the method of a form post', () => {
      redirect.httpsRedirect(request('rmkfish.duckdns.org', { method: 'POST' }), res, next);
      res.status.should.equal(307);
    });

    it('lets requests through the proxy pass', () => {
      redirect.httpsRedirect(request('rmkfish.duckdns.org', { headers: { 'x-forwarded-proto': 'https' } }), res, next);
      next.called.should.equal(true);
      should.not.exist(res.url);
    });

    it('lets requests from the server itself pass', () => {
      ['localhost', '127.0.0.1', '::1'].forEach(function(host) {
        next.called = false;
        redirect.httpsRedirect(request(host), res, next);
        next.called.should.equal(true);
      });
      should.not.exist(res.url);
    });
  });
});
