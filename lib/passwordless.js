// File System dependencies
const fs = require('fs');
const path = require('path');
// Express middleware
const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');

// Passwordless dependencies
const passwordless = require('passwordless');
const LokiTokenStore = require('passwordless-lokijsstore');
const tokenSentPage = fs.readFileSync(path.join(__dirname, '../public/html/tokensent.html')).toString();
const errorPage = fs.readFileSync(path.join(__dirname, '../public/html/error.html')).toString();

// Express session dependencies
const session = require('express-session');
const LokiSessionStore = require('connect-loki')(session);

// Wrapper for express app to support passwordless auth
module.exports = function(app, config) {
  if (!config.passwordless) {
      return {
        enabled: false
      }
  }

  function getRootURL(req) {
    return req.protocol + "://" + req.get('Host');
  }

  if(config.smtp_password) {
    config.smtp.password = config.smtp_password
  }
  if(config.smtp_user) {
    config.smtp.user = config.smtp_user
  }
  const email   = require("./email")(config.smtp);
  const sessiondir = 'sessions';
  if (!fs.existsSync(sessiondir)){
    fs.mkdirSync(sessiondir);
  }
  app.use(session({
    name: app.get('title') || "session",
    store: new LokiSessionStore({path: 'sessions/sessions.json'}),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false
  }));

  passwordless.init(new LokiTokenStore('sessions/tokens.json'));
  passwordless.addDelivery('log',
      function(tokenToSend, uidToSend, recipient, callback, req) {
          // Send out a token
          console.log('New Token: ', tokenToSend, getRootURL(req) + '/login/verify?token=' + tokenToSend + '&uid=' + encodeURIComponent(uidToSend));
          callback(null);
      });
  send = function(type) {
    return function(tokenToSend, uidToSend, recipient, callback, req) {
      let url = getRootURL(req) + '/login/verify?token=' + tokenToSend + '&uid=' + encodeURIComponent(uidToSend);
      console.log('Token Request', tokenToSend, type, url);
      email.sendToken(recipient, tokenToSend, url, callback);
    }
  }
  passwordless.addDelivery('email', send('email'));
  passwordless.addDelivery('code', send('code'),
      { 'numberToken': { max: 1000000 },
        'ttl': 1000 * 60 * 5 // 5 minutes
      });

  app.use(passwordless.sessionSupport());
  app.use(bodyParser.urlencoded({ extended: false }));

  if(!config.validuser) {
    config.validuser = function() { return true; }
  }

  app.get('/',
    (req, res, next) => {
      if (!req.user) {
        res.sendFile(path.join(__dirname, '../public/html/login.html'));
      } else if (config.validuser && config.validuser(req.user)) {
        next();
      } else {
        // Error unauthorized accessLog
        res.status(403).send(errorPage.replace('%%ERROR%%', "You are note allowed to use this application. Maybe you could get access by asking kindly, you should know who to ask..."));
      }
    }
  );

  /* POST login details. */
  router.post('/',
    passwordless.requestToken(
      // Turn the email address into an user ID
      function(uid, delivery, callback, req) {
        const user = uid.trim();
        if (config.validuser && config.validuser(user)) {
          callback(null, user);
        } else {
          console.error("Rejected token for ", user);
          callback(null, null);
        }
      }, { failureRedirect: '/login'}),
      function(req, res) {
         // success!
        var re = /%%email%%/gi;
        res.send(tokenSentPage.replace(re, req.body.user.trim()));
      }
  );
  // Accept tokens only on /login/verify
  router.get('/verify', passwordless.acceptToken({
    successRedirect: '/'
  }));

  app.use('/login', router);
  app.get('/logout',
    function(req,res){
      req.session.destroy(function(err) {
        res.redirect('/');
      })
    });
  app.get('/config.json', passwordless.restricted());
  app.use('/files', passwordless.restricted());
  app.use('/admin', function(req, res, next) {
      // Check session and user in whitelist
      if( config.admins.indexOf(req.user) == -1 ) {
        console.warn(req.user + " is not in list: " + config.admins.join(" "));
        // otherwise error 403 Unauthorized
        res.status(403).send(errorPage.replace('%%ERROR%%', "You are not an allowed admin. Maybe you could get access by asking kindly, you should know who to ask..."));
      }
      next(); // user is actually admin
  });

  return  {
    enabled: true
  }
}
