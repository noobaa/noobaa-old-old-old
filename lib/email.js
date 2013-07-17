// setup mailer

var nodemailer = require("nodemailer");
var smtp = nodemailer.createTransport("SMTP", {
	service: "Mailgun",
	auth: {
		user: process.env.MAILGUN_SMTP_LOGIN,
		pass: process.env.MAILGUN_SMTP_PASSWORD
	},
	// TODO: this is development configuration
	// debug: true,
	maxConnections: 1
});


exports.email_invite_request = function(req, res) {
	var mail_options = {
		from: 'mailer@noobaa.com',
		to: 'guy.margalit@noobaa.com',
		// TODO: send to yuval too...
		// to: ['guy.margalit@noobaa.com', 'yuval.dimnik@noobaa.com'],
		subject: 'request invite',
		text: JSON.stringify(req.body)
	};
	console.log(mail_options);
	smtp.sendMail(mail_options, function(err, response) {
		if (err) {
			console.error('ERROR - REQUEST INVITE FAILED:', err);
			res.send(500, err);
		} else {
			console.log("request invite sent:", response.message);
			res.send(200);
		}
	});
};