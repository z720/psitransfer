const email   = require("emailjs");

module.exports = function(smtpParam) {
  if(!smtpParam){
    return {
      sendToken: function(email, token, host) {
        console.log(host + ' Token for ' + email + ' : ' + token);
      }
    }
  }
  const smtpServer = email.server.connect({
    user: smtpParam.user,
    password: smtpParam.password,
    host: smtpParam.host,
    ssl: smtpParam.ssl
  });
  return {
    server: smtpServer,
    sendToken: function(recipient, token, url, callback) {
      smtpServer.send({
        text:    'Hello!\nAccess your account using this code: ' + token
            + '\n or click here: ' + url,
        from:    smtpParam.user,
        to:      recipient,
        subject: 'Acccess your account ' + token
      }, function(err, message) {
        if(err) {
          console.error(err);
        }
        callback();
      })
    }
  }
}
