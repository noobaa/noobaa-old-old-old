/* jshint node:true */
'use strict';


var mandrill = require('node-mandrill')('hHtPZqX1hKW7nmPdzTABvg');
var path = require('path');
var async = require('async');
var common_api = require('./common_api');
var track_api = require('./track_api');
var dot = require('dot');
var _ = require('underscore');

var EMAIL_STYLES = [
	'<style>',
	'.nbcapsule {',
	'  max-width: 420px;',
	'  font-family: "Helvetica Neue",Helvetica,Arial,sans-serif;',
	'  border-radius: 100px;',
	'  background-color: hsl(0,0%,0%);',
	'  border: 1px solid hsl(0,0%,0%);',
	'  margin-left: auto;',
	'  margin-right: auto;',
	// '  text-shadow: -2px 2px 2px hsl(0,0%,10%);',
	'}',
	'.nbcapsule > div {',
	'  padding-left: 15px;',
	'  padding-right: 10px;',
	'}',
	// '@media all and (max-width: 500px) {',
	// '  .nbcapsule > div {',
	// '    padding-left: 20px;',
	// '    padding-right: 20px;',
	// '  }',
	// '}',
	'.nbcapsule .text-color {',
	'  color: hsl(199,68%,50%);',
	'}',
	'.nbcapsule .text-bright {',
	'  color: hsl(0,0%,85%);',
	'}',
	'.nbcapsule .text-grey {',
	'  color: hsl(0,0%,45%);',
	'}',
	'.nbcapsule .border-top {',
	'  border-top: 1px solid hsl(0,0%,20%);',
	'}',
	'.nbcapsule a {',
	'  color: hsl(210,50%,50%);',
	'  text-decoration: none;',
	'}',
	'.nbcapsule a:hover {',
	'  color: hsl(210,70%,60%);',
	'  text-decoration: underline;',
	'}',
	'.nbcapsule .heading1 {',
	'  font-size: 18px;',
	'  line-height: 1.5em;',
	'}',
	'.nbcapsule .heading2 {',
	'  font-size: 15px;',
	'  line-height: 1.5em;',
	'}',
	'.nbcapsule .smalltext {',
	'  font-size: 12px;',
	'  line-height: 1.5em;',
	'}',
	'.nbcapsule .pict {',
	'  width: 30px;',
	'  height: 30px;',
	'  border-radius: 6px;',
	'  margin-right: 5px;',
	'  -webkit-transition: all 0.5s;',
	'  -moz-transition: all 0.5s;',
	'  -o-transition: all 0.5s;',
	'  transition: all 0.5s;',
	'}',
	/*
	'.nbcapsule .message .pict {',
	'  width: 30px;',
	'  height: 30px;',
	'  border-radius: 5px;',
	'}',
	*/
	'.nbcapsule .hoverable {',
	'  -webkit-transition: all 0.5s;',
	'  -moz-transition: all 0.5s;',
	'  -o-transition: all 0.5s;',
	'  transition: all 0.5s;',
	'}',
	'.nbcapsule .hoverable:hover, .nbcapsule .hoverable:focus {',
	'  background-color: hsl(0,0%,10%);',
	'}',
	/*
	'.nbcapsule .hoverable:hover .pict, .nbcapsule .hoverable:focus .pict {',
	'  width: 50px;',
	'  height: 50px;',
	'  transform: rotate(360deg);',
	'  -webkit-transform: rotate(360deg);',
	'}',
	*/
	'.nbcapsule .caret {',
	'  width: 0;',
	'  height: 0;',
	'  border-top: 15px solid transparent;',
	'  border-bottom: 15px solid transparent;',
	'  border-left: 15px solid black;',
	'  margin-top: 10px;',
	'  margin-left: 20px;',
	'}',
	'.nbcapsule .action-btn {',
	'  width: 50px;',
	'  height: 50px;',
	'  margin: 0px 5px;',
	'  border-radius: 25px;',
	'  overflow: hidden;',
	'  font-size: 40px;',
	'  text-align: center;',
	'  background-color: hsl(0,0%,80%);',
	'  color: black;',
	'  -webkit-transition: all 0.5s;',
	'  -moz-transition: all 0.5s;',
	'  -o-transition: all 0.5s;',
	'  transition: all 0.5s;',
	'}',
	'.nbcapsule .hoverable:hover .action-btn, .nbcapsule .hoverable:focus .action-btn {',
	'  background-color: hsl(32, 80%, 50%);',
	'  -webkit-animation-name: dancing;',
	'  -webkit-animation-duration: 1.3s;',
	'  -webkit-transform-origin: 50% 50%;',
	'  -webkit-animation-iteration-count: infinite;',
	'  -webkit-animation-timing-function: linear;',
	'}',
	// '.nbcapsule .action-btn:hover, .nbcapsule .action-btn:focus {',
	// '  background-color: hsl(0, 0%, 70%) !important;',
	// '}',
	'@-webkit-keyframes dancing {',
	'  0% { -webkit-transform: translate(0px, 0px); }',
	'  25% { -webkit-transform: translate(-4px, 0px); }',
	'  50% { -webkit-transform: translate(0px, 0px); }',
	'  75% { -webkit-transform: translate(4px, 0px); }',
	'  100% { -webkit-transform: translate(0px, 0px); }',
	'}',
	'</style>'
].join('\n');


var SWM_TEMAPLATE = dot.template([
	'<div>',
	EMAIL_STYLES,
	' <div class="nbcapsule">',
	'  <div>',
	'   <div style="padding: 25px 0 0 0; text-align: center" class="text-bright heading1">',
	'    Hi <?! it.user.get_first_name() ?>',
	'   </div>',
	'   <div style="padding: 5px 0 15px 0; text-align: center" class="heading1 text-grey">',
	'    <?! it.title ?>',
	'   </div>',
	'  </div>',
	'  <?~ it.shares :item:index ?>',
	'  <div style="padding-top: 10px; padding-bottom: 15px;" class="border-top hoverable">',
	'   <div style="padding: 0px 0 0 0">',
	'    <div style="float: right">',
	'     <a href="https://www.noobaa.com/home/">',
	'      <div class="action-btn"><div class="caret"></div></div>',
	'     </a>',
	'    </div>',
	'    <div style="overflow: hidden" class="heading1 text-color">',
	'     <?! item.inode.name ?>',
	'    </div>',
	'   </div>',
	'   <div style="padding-top: 10px">',
	'    <div style="float: left">',
	'     <img src="<?! item.inode.ref_owner.get_pic_url() ?>" class="pict" />',
	'    </div>',
	'    <div style="overflow: hidden">',
	'     <div style="padding-bottom: 5px" class="heading2 text-bright smalltext">',
	'      <span><?! item.inode.ref_owner.get_name() ?></span>',
	'     </div>',
	'    </div>',
	'    <div style="overflow: hidden; padding-top: 5px">',
	'     <?~ item.messages :msg:msg_index ?>',
	'      <div class="message" style="overflow: hidden; padding-top: 5px">',
	'       <div style="float: left">',
	'        <img src="<?! msg.user.get_pic_url() ?>" class="pict" />',
	'       </div>',
	'       <div style="overflow: hidden">',
	'        <div style="margin: 0" class="heading2 text-bright smalltext">',
	'         <span><?! msg.user.get_name() ?></span>',
	'        </div>',
	'        <div class="text-grey smalltext"><?! msg.text ?></div>',
	'       </div>',
	'      </div>',
	'     <?~?>',
	'    </div>',
	'   </div>',
	'  </div>',
	'  <?~?>',
	'  <div style="padding-top: 10px; padding-bottom: 20px; text-align: center" class="border-top">',
	'   <a href="https://www.noobaa.com">',
	'    <img src="https://www.noobaa.com/public/images/noobaa_logo.png" height="44px" />',
	'    <div class="smalltext text-color">Connecting the dots</div>',
	'   </a>',
	'  </div>',
	' </div>',
	' <?~ it.tracking_pixel_urls :pixel_url:index ?>',
	'  <img src="<?! pixel_url ?>" width="1" height="1" />',
	' <?~?>',
	'</div>'
].join('\n'));




function prepare_email_message(user) {
	var msg = {
		from_email: "info@noobaa.com",
		from_name: "NooBaa Team",
		bcc_address: "info@noobaa.com",
		google_analytics_domains: ["noobaa.com"],
	};

	// when not providing a user, return a msg without a 'to' field
	if (!user) {
		return msg;
	}

	var name = user.get_name();
	var email = user.get_email();
	if (!email) {
		console.log('USER HAS NO EMAIL', name);
		return; // return undefined to avoid sending
	} else {
		msg.to = [{
			email: email,
			name: name
		}];
		return msg;
	}
}

function email_callback(callback) {
	return function(err, result) {
		if (err) {
			console.error('SEND EMAIL FAILED', err);
		} else {
			console.log('SENT EMAIL', result);
		}
		if (callback) {
			return callback(err, result);
		}
	};
}


// to see how to add dynamic info:
// help.mandrill.com/entries/21678522-how-do-i-use-merge-tags-to-add-dynamic-content
exports.send_alpha_welcome = function(user, callback) {
	var msg = prepare_email_message(user);
	if (!msg) {
		return callback(null, user);
	}
	msg.subject = 'Welcome to NooBaa!';
	msg.global_merge_vars = [{
		name: "subject",
		content: 'Welcome to NooBaa'
	}, {
		name: "UPDATE_PROFILE",
		content: 'http://www.noobaa.com/'
	}, {
		name: "FNAME",
		content: user.get_first_name()
	}];

	return mandrill('/messages/send-Template', {
		template_name: "alpha-welcome",
		template_content: [],
		message: msg
	}, email_callback(function(err) {
		// ignore errors on email for now
		return callback(null, user);
	}));
};

exports.send_mail_changed = function(user, callback) {
	console.log('send mail change email');
	var msg = prepare_email_message(user);
	if (!msg) {
		return callback(null, user);
	}
	msg.subject = 'NooBaa account updated';
	msg.global_merge_vars = [{
		name: "subject",
		content: 'NooBaa account updated'
	}, {
		name: "UPDATE_PROFILE",
		content: 'http://www.noobaa.com/'
	}, {
		name: "NEWMAIL",
		content: user.get_email()
	}, {
		name: "FNAME",
		content: user.get_first_name()
	}, {
		name: "UNAME",
		content: user.get_name()
	}];
	return mandrill('/messages/send-Template', {
		template_name: "email-changed",
		template_content: [],
		message: msg
	}, email_callback(function(err) {
		// ignore errors on email for now
		return callback(null, user);
	}));
};

exports.user_feedback = function(req, res) {
	return mandrill('/messages/send', {
		message: {
			from_email: 'info@noobaa.com',
			from_name: 'NooBaa Team',
			to: [{
				email: 'info@noobaa.com',
				name: 'info@noobaa.com'
			}],
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


exports.test_mandril = function() {
	return mandrill('/messages/send', {
		message: {
			to: [{
				email: 'yuval.dimnik@gmail.com',
				name: 'Yuval Dimnik'
			}],
			from_email: 'info@noobaa.com',
			subject: "Hey, what's up?",
			text: "Hello, I sent this message using mandrill."
		}
	}, email_callback());
};

exports.get_templates = function() {
	return mandrill('/templates/list', {}, email_callback());
};



exports.send_alpha_approved_notification = send_alpha_approved_notification;

function send_alpha_approved_notification(user, callback) {
	var msg = prepare_email_message(user);
	if (!msg) {
		return callback(null, user);
	}
	msg.subject = user.get_name() + ". You are the chosen one.";
	msg.text = [
		'Hi ' + user.get_first_name() + ' and welcome to NooBaa.\n\n',
		'We\'re very fortunate to have you and are happy to notify you that you\'ve been approved',
		'as one of the very few alpha users.\n',
		'\n',
		'As an approved user you can use your facebook/google login again at http://www.noobaa.com. ',
		'This time you\'ll get to the NooBaa dashboard, where you can upload, share and see files',
		'shared with you by your friends.',
		'\n\t\t\t\t\t\t The NooBaa Team'
	].join('\n');
	return mandrill('/messages/send', {
		message: msg
	}, email_callback(callback));
}


exports.send_recent_swm_notification = send_recent_swm_notification;

function send_recent_swm_notification(user, shares, callback) {
	console.log('RECENT SWM', user, shares);

	var msg = prepare_email_message(user);
	if (!msg) {
		return callback(null, user);
	}
	// make the url unique with miliseconds timestamp and random number
	var ctx = {
		time: Date.now(),
		rand: Math.random()
	};
	var user_info = user.get_user_identity_info();
	var tracking_pixel_url = track_api.tracking_pixel_url('email.recent_swm.open', null, user_info, ctx);
	var mixpanel_pixel_url = track_api.mixpanel_pixel_url('email.recent_swm.open', user.id, ctx);
	var sharers_names = _.map(shares, function(item) {
		return item.inode.ref_owner.get_first_name();
	});
	var sharers_for_subject = _.first(_.uniq(sharers_names), 3).join(' and ');
	var template_args = {
		title: 'Here are recent things shared with you',
		user: user,
		shares: shares,
		tracking_pixel_urls: [tracking_pixel_url, mixpanel_pixel_url],
	};
	var bcc_template_args = _.clone(template_args);
	bcc_template_args.tracking_pixel_urls = [];

	msg.subject = sharers_for_subject + ' shared new things with you on NooBaa';
	msg.html = SWM_TEMAPLATE(template_args);
	// don't send bcc with tracking urls
	msg.bcc_address = null;
	var bcc_msg = _.clone(msg);
	bcc_msg.to = [{
		name: msg.to[0].name,
		email: 'info@noobaa.com'
	}];
	bcc_msg.track_opens = false;
	bcc_msg.track_clicks = false;
	bcc_msg.html = SWM_TEMAPLATE(bcc_template_args);

	return async.parallel([
		function(next) {
			console.log('SEND RECENT SWM MSG', user.get_name());
			return mandrill('/messages/send', {
				message: msg
			}, email_callback(next));
		},
		function(next) {
			console.log('SEND RECENT SWM BCC', user.get_name());
			return mandrill('/messages/send', {
				message: bcc_msg
			}, email_callback(next));
		},
	], callback);
}

exports.test_email_templates = function(req, res) {
	var user = {
		get_name: function() {
			return req.user.name;
		},
		get_first_name: function() {
			return req.user.first_name;
		},
		get_pic_url: function() {
			return 'https://graph.facebook.com/' + req.user.fbid + '/picture';
		}
	};
	var msg = {
		user: user,
		text: 'lalalal lalala lkajlkjasd olkjl kjasdlkj alksjd lkj lkj lkja lskjd lkj asd'
	};
	var shares = [{
		inode: {
			name: 'Testing SWM 1',
			ref_owner: user
		},
		messages: [msg, msg]
	}, {
		inode: {
			name: 'Shtuyut Ze lo Yachol Lihiot',
			ref_owner: user
		}
	}, {
		inode: {
			name: 'Balllalalal al la',
			ref_owner: user
		}
	}];
	res.write('<div style="margin: 10px; padding: 10px; border: 1px solid black">');
	res.write(SWM_TEMAPLATE({
		title: 'Here are recent things shared with you',
		user: user,
		shares: shares,
		tracking_pixel_urls: [],
	}));
	res.write('</div>');
	res.end();
};
