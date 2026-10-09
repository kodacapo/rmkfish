'use strict';

// Sends visitors who reach the app directly (http://host:8080) to the HTTPS
// address served by the reverse proxy (Caddy on the droplet). Off unless
// FISH_HTTPS_REDIRECT is set, because servers without such a proxy (e.g. the
// upstream Windows server) have no HTTPS address to send anyone to.
//
// Requests that came through the proxy carry X-Forwarded-Proto; requests from
// the server itself (localhost) are left alone.

var LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];

exports.isEnabled = function(env) {
  var value = (env || {}).FISH_HTTPS_REDIRECT;
  return !!value && value !== '0' && value !== 'false';
};

exports.httpsRedirect = function(req, res, next) {
  var host = req.hostname;
  if (req.headers['x-forwarded-proto'] || !host || LOCAL_HOSTS.indexOf(host) !== -1) return next();
  // 307 keeps the method and body of a form post; plain page loads get 302
  var status = req.method === 'GET' || req.method === 'HEAD' ? 302 : 307;
  res.redirect(status, 'https://' + host + req.originalUrl);
};
