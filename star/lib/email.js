/* jshint node:true */
'use strict';


var mandrill = require('node-mandrill')('hHtPZqX1hKW7nmPdzTABvg');
var path = require('path');
var templatesDir = path.resolve(__dirname, '..', 'email_templates');
var emailTemplates = require('email-templates');
var nodemailer = require('nodemailer');
var common_api = require('./common_api');
var track_api = require('./track_api');
var dot = require('dot');

// to see how to add dynamic info:
// help.mandrill.com/entries/21678522-how-do-i-use-merge-tags-to-add-dynamic-content
exports.send_alpha_welcome = function(user, callback) {

	var localemail = user.get_email();
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
				content: user.get_first_name()
			}],
			subject: 'Welcome to NooBaa!',
			from_email: 'info@noobaa.com',
			from_name: 'NooBaa Team',
			to: [{
				email: localemail,
				name: user.get_name()
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
	var localemail = user.get_email();
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
				content: user.get_first_name()
			}, {
				name: "UNAME",
				content: user.get_name()
			}],
			subject: 'NooBaa account updated',
			from_email: 'info@noobaa.com',
			from_name: 'NooBaa Team',
			to: [{
				email: localemail,
				name: user.get_name()
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

exports.user_feedback = function(req, res) {
	mandrill('/messages/send', {
		message: {
			to: [{
				email: 'info@noobaa.com',
				name: 'info@noobaa.com'
			}],
			from_email: 'info@noobaa.com',
			from_name: 'NooBaa Team',
			subject: "User Feedback - " + req.user.name,
			text: [
				'USER DETAILS (just in case):\n',
				JSON.stringify(req.user),
				'\n\nFEEDBACK:\n',
				req.body.feedback
			].join('\n')
		}
	}, common_api.reply_callback(req, res, 'USER FEEDBACK ' + req.user.id));
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

exports.send_swm_notification = send_swm_notification;

// I looked at this to get some insipration: 
// http://blog.mandrill.com/an-awesome-plain-text-email.html
// I didn't think the notification should be HTML since it's prefered it will 
// be as slim as possible. 
// The custom message is a text that can be transfered to add some spice to 
// the message. some examples are: 
// "Fresh from the oven" for files recently uploaded
// "Of all people, X wanted YOU to check it out" if shared with a small number of users. 
// It is not part of the email module logic 
// to losen the coupling with the inodes and FS structure. 

var SWM_TEMAPLATE = dot.template([
	'<div style="background-color: #e2e2e2; color: #282828">',
	' <div style="background-color: #282828; text-align: center; padding: 10px">',
	'  <img src="https://www.noobaa.com/public/images/noobaa_logo.png" height="44px" />',
	' </div>',
	' <div style="padding: 0 40px">',
	// '  <h2>Hi <?! it.notified_user_first_name ?></h2>',
	'  <h3 style="margin: 20px 0">',
	'   <img src="<?! it.sharing_user_pic_url ?>" style="vertical-align: middle; height: 40px; width: 40px" />',
	'   <span><?! it.sharing_user_full_name ?></span>',
	'  </h3>',
	'  <div style="margin: 40px 0 20px 44px">',
	// '   <div><small style="color: #888888">shared with you</small></div>',
	'   <h2>',
	'    <a href="https://www.noobaa.com/home/"><?! it.file_name ?></a>',
	'   </h2>',
	'  </div>',
	'  <div style="margin: 40px 0 0 0">',
	'   <p>Check it out on your NooBaa account</p>',
	'   <p><a href="https://www.noobaa.com">www.noobaa.com</a></p>',
	'   <p>Connecting the dots</p>',
	'  </div>',
	' </div>',
	' <img src="<?! it.tracking_pixel_url ?>" width="1" height="1" />',
	' <img src="<?! it.mixpanel_pixel_url ?>" width="1" height="1" />',
	'</div>'
].join('\n'));

function send_swm_notification(notified_user, sharing_user, file_name, custom_message, callback) {
	var localemail = notified_user.get_email();
	var notified_user_full_name = notified_user.get_name();
	var notified_user_first_name = notified_user.get_first_name();
	var sharing_user_full_name = sharing_user.get_name();
	var sharing_user_first_name = sharing_user.get_first_name();

	if (!localemail) {
		console.log(notified_user_full_name + ", has no updated email address.");
		return callback(null, {
			"message": notified_user_full_name + ", has no updated email address"
		});
	}

	if (custom_message) {
		custom_message = "\n" + custom_message + "\n";
	} else {
		custom_message = '';
	}

	function user_pic_url(user) {
		if (!user) {
			return;
		}
		if (user.fb.id) {
			return 'https://graph.facebook.com/' + user.fb.id + '/picture';
		}
		if (user.google.id) {
			return 'https://plus.google.com/s2/photos/profile/' + user.google.id + '?sz=50';
		}
	}

	var ctx = {
		// make the url unique with miliseconds timestamp and random number
		time: Date.now(),
		rand: Math.random()
	};
	var tracking_pixel_url = track_api.tracking_pixel_url('email.shared.open', null, notified_user, ctx);
	var mixpanel_pixel_url = track_api.mixpanel_pixel_url('email.shared.open', notified_user.id, ctx);

	var mailJson = {
		"message": {
			"html": SWM_TEMAPLATE({
				notified_user_first_name: notified_user_first_name,
				sharing_user_pic_url: user_pic_url(sharing_user),
				sharing_user_full_name: sharing_user_full_name,
				file_name: file_name,
				tracking_pixel_url: tracking_pixel_url,
				mixpanel_pixel_url: mixpanel_pixel_url,
			}),
			/*
			"text": [
				"Hi " + notified_user_first_name + ",\n\n" + sharing_user_first_name,
				" has shared a file with you:" + "\n" + file_name + "\n\n",
				"Just checkout the \'Shared With Me\' folder on your main dashboard." + "\n",
				"http://www.noobaa.com" + "\n" + custom_message,
				"\n\t\t\t\t\t\t\t\t The NooBaa Team" + "\n",
				"p.s." + "\n" + "As long as the file is shared with you, ",
				"you can access it and it doesn\'t take any of your capacity. " + "\n"
			].join(''),
			*/
			"subject": file_name + ' was shared with you by ' + sharing_user_first_name + ' on NooBaa',
			"from_email": "info@noobaa.com",
			"from_name": "NooBaa Team",
			"to": [{
				"email": localemail,
				"name": notified_user_full_name
			}],
			"important": false,
			"track_opens": null,
			"track_clicks": null,
			"auto_text": null,
			"auto_html": null,
			"inline_css": null,
			"url_strip_qs": null,
			"preserve_recipients": null,
			"bcc_address": "info@noobaa.com",
			"tracking_domain": null,
			"signing_domain": null,
			"return_path_domain": null,
			"merge": true,
			/*			"global_merge_vars": [{
				"name": "merge1",
				"content": "merge1 content"
			}],
			"merge_vars": [{
				"rcpt": "recipient.email@example.com",
				"vars": [{
					"name": "merge2",
					"content": "merge2 content"
				}]
			}],
*/
			"tags": [
				"shared-file"
			],
			// "subaccount": "customer-123",
			"google_analytics_domains": [
				"noobaa.com"
			],
			// "google_analytics_campaign": "message.from_email@example.com",
			"metadata": {
				"website": "www.noobaa.com"
			},
			/*			"recipient_metadata": [{
				"rcpt": "recipient.email@example.com",
				"values": {
					"user_id": 123456
				}
			}],
			"attachments": [{
				"type": "text/plain",
				"name": "myfile.txt",
				"content": "ZXhhbXBsZSBmaWxl"
			}],
			"images": [{
				"type": "image/png",
				"name": "IMAGECID",
				"content": "ZXhhbXBsZSBmaWxl"
			}]
*/
		},
		"async": false,
		"ip_pool": "Main Pool",
		// "send_at": "example send_at"
	};
	mandrill('/messages/send.json', mailJson, callback);
}

exports.send_alpha_approved_notification = send_alpha_approved_notification;

function send_alpha_approved_notification(notified_user, callback) {
	var localemail = notified_user.get_email();
	var notified_user_full_name = notified_user.get_name();
	var notified_user_first_name = notified_user.get_first_name();

	if (!localemail) {
		console.log(notified_user_full_name + ", has no updated email address.");
		return callback(null, {
			"message": notified_user_full_name + ", has no updated email address"
		});
	}

	var mailJson = {
		"message": {
			// "html": "<p>Example HTML content</p>",
			"text": [
				'Hi ' + notified_user_first_name + ' and welcome to NooBaa.\n\n',
				'We\'re very fortunate to have you and are happy to notify you that you\'ve been approved',
				'as one of the very few alpha users.\n',
				'\n',
				'As an approved user you can use your facebook/google login again at http://www.noobaa.com. ',
				'This time you\'ll get to the NooBaa dashboard, where you can upload, share and see files',
				'shared with you by your friends.',
				'\n\t\t\t\t\t\t The NooBaa Team'
			].join('\n'),
			"subject": notified_user_full_name + ". You are the chosen one.",
			"from_email": "info@noobaa.com",
			"from_name": "NooBaa Team",
			"to": [{
				"email": localemail,
				"name": notified_user_full_name
			}],
			"important": false,
			"track_opens": null,
			"track_clicks": null,
			"auto_text": null,
			"auto_html": null,
			"inline_css": null,
			"url_strip_qs": null,
			"preserve_recipients": null,
			"bcc_address": "info@noobaa.com",
			"tracking_domain": null,
			"signing_domain": null,
			"return_path_domain": null,
			"merge": true,
			/*			"global_merge_vars": [{
				"name": "merge1",
				"content": "merge1 content"
			}],
			"merge_vars": [{
				"rcpt": "recipient.email@example.com",
				"vars": [{
					"name": "merge2",
					"content": "merge2 content"
				}]
			}],
*/
			"tags": [
				"shared-file"
			],
			// "subaccount": "customer-123",
			"google_analytics_domains": [
				"noobaa.com"
			],
			// "google_analytics_campaign": "message.from_email@example.com",
			"metadata": {
				"website": "www.noobaa.com"
			},
			/*			"recipient_metadata": [{
				"rcpt": "recipient.email@example.com",
				"values": {
					"user_id": 123456
				}
			}],
			"attachments": [{
				"type": "text/plain",
				"name": "myfile.txt",
				"content": "ZXhhbXBsZSBmaWxl"
			}],
			"images": [{
				"type": "image/png",
				"name": "IMAGECID",
				"content": "ZXhhbXBsZSBmaWxl"
			}]
*/
		},
		"async": false,
		"ip_pool": "Main Pool",
		// "send_at": "example send_at"
	};
	mandrill('/messages/send.json', mailJson, callback);
}


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
