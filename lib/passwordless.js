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

// Express session dependencies
const session = require('express-session');
const LokiSessionStore = require('connect-loki')(session);

// Wrapper for express app to support passwordless auth
module.exports = function(app, config) {
  if (!config.passwordless) {
      return {
        required: function(req,res,next) {
          next();
        }
      }
  }
  let rootURL;
  if(config.sslPort && config.sslKeyFile && config.sslCertFile) {
    // https
    rootURL = "https://" + config.hostname;
    if(config.sslPort && config.sslPort != 443) {
      rootURL += ":" + config.sslPort;
    }
  } else {
    // http
    rootURL = "http://" + config.hostname;
    if (config.port && config.port != 80) {
      rootURL += ":" + config.port;
    }
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
      function(tokenToSend, uidToSend, recipient, callback) {
          // Send out a token
          console.log('New Token: ' + rootURL + '/login/verify?token=' + tokenToSend + '&uid=' + encodeURIComponent(uidToSend));
          callback(null);
      });
  send = function(type) {
    return function(tokenToSend, uidToSend, recipient, callback) {
      console.log('Token Request', type, recipient, tokenToSend);
      let url = rootURL + '/login/verify?token=' + tokenToSend + '&uid=' + encodeURIComponent(uidToSend);
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
}
