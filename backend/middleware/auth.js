'use strict';

function requireLogin(req, res, next) {
  if (req.session.user) return next();
  req.session.flash = { type: 'error', msg: 'Please log in first.' };
  res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    req.session.flash = { type: 'error', msg: 'Please log in first.' };
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  if (!['Owner', 'Staff'].includes(req.session.user.user_type)) {
    return res.status(403).render('error', {
      title: 'Access Denied',
      message: 'You do not have permission to view this page.'
    });
  }
  next();
}

module.exports = { requireLogin, requireAdmin };
