/* jshint node:true */
'use strict';


var mandrill = require('node-mandrill')('hHtPZqX1hKW7nmPdzTABvg');
var path = require('path');
var templatesDir = path.resolve(__dirname, '..', 'email_templates');
var emailTemplates = require('email-templates');
var nodemailer = require('nodemailer');

function choose_mail(user) {
	return user.email || user.fb.email || null;
}

// to see how to add dynamic info:
//help.mandrill.com/entries/21678522-how-do-i-use-merge-tags-to-add-dynamic-content
exports.send_alpha_welcome = function(user, callback) {

	var localemail = choose_mail(user);
	if (!localemail) {
		console.log("User has no email defined.");
		return callback(null, user);
	}

	mandrill('/messages/send-Template', {
		template_name: "alpha-welcome",
		template_content: [],
		message: {
			"global_merge_vars": [{
				name: "subject",
				content: 'Welcome to NooBaa'
			}, {
				name: "UPDATE_PROFILE",
				content: 'http://www.noobaa.com/'
			}, {
				name: "FNAME",
				content: user.fb.first_name
			}],
			subject: 'Welcome to NooBaa!',
			from_email: 'info@noobaa.com',
			from_name: 'NooBaa Team',
			to: [{
				email: localemail,
				name: user.fb.name
			}],
		}
	}, function(err, result) {
		if (!err) {
			console.log(result);
		} else {
			console.log(JSON.stringify(err));
		}
		//we're ignoring errors on email for now.
		callback(null, user);
	});

};

exports.send_mail_changed = function(user, callback) {
	console.log('send mail change email ');
	var localemail = choose_mail(user);
	if (!localemail) {
		console.log("User has no email defined.");
		return callback(null, user);
	}

	mandrill('/messages/send-Template', {
		template_name: "email-changed",
		template_content: [],
		message: {
			"global_merge_vars": [{
				name: "subject",
				content: 'NooBaa account updated'
			}, {
				name: "UPDATE_PROFILE",
				content: 'http://www.noobaa.com/'
			}, {
				name: "NEWMAIL",
				content: localemail
			}, {
				name: "FNAME",
				content: user.fb.first_name
			}, {
				name: "UNAME",
				content: user.fb.name
			}],
			subject: 'NooBaa account updated',
			from_email: 'info@noobaa.com',
			from_name: 'NooBaa Team',
			to: [{
				email: localemail,
				name: user.fb.name
			}],
		}
	}, function(err, result) {
		if (!err) {
			console.log(result);
		} else {
			console.log(JSON.stringify(err));
		}
		//we're ignoring errors on email for now.
		callback(null, user);
	});

};


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

exports.request_invite = function(req, res) {
	var mail_options = {
		from: 'mailer@noobaa.com',
		to: ['guy.margalit@noobaa.com', 'yuval.dimnik@noobaa.com'],
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


//send an e-mail to jim rubenstein
exports.test_mandril = function() {
	mandrill('/messages/send', {
		message: {
			to: [{
				email: 'yuval.dimnik@gmail.com',
				name: 'Yuval Dimnik'
			}],
			from_email: 'info@noobaa.com',
			subject: "Hey, what's up?",
			text: "Hello, I sent this message using mandrill."
		}
	}, function(error, response) {
		//uh oh, there was an error
		if (error) console.log(JSON.stringify(error));

		//everything's good, lets see what mandrill said
		else console.log(response);
	});
};

exports.get_templates = function() {
	mandrill('/templates/list', {}, function(error, response) {
		//uh oh, there was an error
		if (error) console.log(JSON.stringify(error));

		//everything's good, lets see what mandrill said
		else console.log(response);
	});

};

/*
setup mailgun
var api_key = process.env.MAILGUN_API_KEY;
var domain  = process.env.MAILGUN_NB_TMP_DOM;
var mailgun = require('mailgun-js')(api_key, domain);


var data = {
  from: process.env.MAILGUN_NB_TMP_FRO,
  to: 'yuval.dimnik@gmail.com',
  subject: 'Hello',
  text: 'Testing some Mailgun awesomness!'
};

mailgun.sendMessage(data, function (error, response, body) {
  console.log('========================= Mailgun test');
  console.log(body);
});

// setup mailer
var path = require('path'),
	templatesDir = path.resolve(__dirname, '..', 'email_templates'),
	emailTemplates = require('email-templates'),
	nodemailer = require('nodemailer');

//based on an example http://niftylettuce.com/node-email-templates/#nodemailer
var transport = nodemailer.createTransport("SMTP", {
	service: "Mailgun",
	auth: {
		user: process.env.MAILGUN_SMTP_LOGIN,
		pass: process.env.MAILGUN_SMTP_PASSWORD
	},
});

emailTemplates(templatesDir, function(err, template) {
	if (err) {
		console.log(err);
	} else {
		// ## Send a single email
		// Prepare nodemailer transport object
		// An example users object with formatted email function
		var locals = {
			email: 'mamma.mia@spaghetti.com',
			name: {
				first: 'Mamma',
				last: 'Mia'
			}
		};
		// Send a single email
		template('newsletter', locals, function(err, html, text) {
			if (err) {
				console.log(err);
			} else {
				transport.sendMail({
					from: 'NooBaa team <mailer@noobaa.com>',
					to: locals.email,
					subject: 'Welcome to NooBaa!',
					html: html,
					// generateTextFromHTML: true,
					text: text
				}, function(err, responseStatus) {
					if (err) {
						console.log(err);
					} else {
						console.log(responseStatus.message);
					}
				});
			}
		});
	}
});

// MAILGUN_API_KEY:         key-8z6pj3e6k3n550i76eg2wggm-or3el44
// MAILGUN_NB_TMP_DOM:      noobaa.mailgun.org
// MAILGUN_NB_TMP_FRO:      dontreply@noobaa.mailgun.org
// MAILGUN_NB_TMP_LOG:      postmaster@noobaa.mailgun.org
// MAILGUN_NB_TMP_PAS:      86cw-sbbmoo8







//=============================================================

var EmailAddressRequiredError = new Error('email address required');
var EmailSubjectRequiredError = new Error('email subject required');

// create a defaultTransport using gmail and authentication that are
// storeed in the `config.js` file.
var defaultTransport = nodemailer.createTransport('SMTP', {
	service: "Mailgun",
	auth: {
		user: 'postmaster@noobaa.mailgun.org',
		pass: '86cw-sbbmoo8'
	},
});



exports.send_welcome = function(user, callback) {
	console.log('in welcome!!!');
	var locals = {
		from: "NooBaa team <info@noobaa.mailgun.org>", // sender address
		subject: "Welcome to NooBaa!",
		email: user.email,
		name: user.name,
	};
	return sendOne('welcome', locals, callback);
};

function sendOne(templateName, locals, callback) {
	// make sure that we have an user email
	if (!locals.email) {
		return callback(EmailAddressRequiredError);
	}
	// make sure that we have a message
	if (!locals.subject) {
		return callback(EmailSubjectRequiredError);
	}
	emailTemplates(templatesDir, function(err, template) {
		if (err) {
			//console.log(err);
			return callback(err);
		}
		// Send a single email
		template(templateName, locals, function(err, html, text) {
			if (err) {
				//console.log(err);
				return callback(err);
			}
			// if we are testing don't send out an email instead return
			// success and the html and txt strings for inspection
			// if (process.env.NODE_ENV === 'test') {
			// return callback(null, '250 2.0.0 OK 1350452502 s5sm19782310obo.10', html, text);
			// }
			var transport = defaultTransport;
			transport.sendMail({
				from: locals.from,
				to: locals.email,
				subject: locals.subject,
				html: html,
				// generateTextFromHTML: true,
				text: text
			}, function(err, responseStatus) {
				if (err) {
					return callback(err);
				}
				return callback(null, responseStatus.message, html, text);
			});
		});
	});
}
*/