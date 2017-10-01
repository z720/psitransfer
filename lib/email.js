const nodemailer = require("nodemailer");

module.exports = function(smtpParam) {
  if (!smtpParam) {
    return {
      sendToken: function(email, token, host) {
        console.log(host + ' Token for ' + email + ' : ' + token);
      }
    }
  }
  const transporter = nodemailer.createTransport(smtpParam);
  console.log(smtpParam);
  // verify connection configuration
  transporter.verify(function(error, success) {
    if (error) {
      console.error(error);
    } else {
      console.info('SMTP Server is ready to take our messages');
    }
  });
  return {
    sendToken: function(recipient, token, url, callback) {
      let message = {
        from: smtpParam.from,
        to: recipient,
        subject: 'Access your account ' + token,
        text: 'Hello!\n\n\nUse this code to confirm your email: ' + token +
          '\n\n\n or follow this link: ' + url
      };
      transporter.sendMail(message, function(err) {
        if (err) {
          console.error(err);
        }
        if (callback) callback();
      });
    }
  }
}
