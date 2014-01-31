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
	'  font-family: "Helvetica Neue",Helvetica,Arial,sans-serif;',
	'  border-radius:100px;',
	'  background-color:hsl(0,0%,10%);',
	'  border:1px solid hsl(0,0%,0%);',
	'  color:hsl(0,0%,90%);',
	'}',
	'.nbcapsule .text-muted {',
	'  color: hsl(0,0%,40%);',
	'}',
	'.nbcapsule .border-top {',
	'  border-top: 1px solid hsl(0,0%,20%);',
	'}',
	'.nbcapsule a {',
	'  color: hsl(210,50%,50%);',
	'}',
	'</style>'
].join('\n');

var SWM_TEMAPLATE = dot.template([
	'<div>',
	EMAIL_STYLES,
	' <div class="nbcapsule">',
	'  <div style="padding: 30px 100px 10px 100px">',
	'   <h3 style="margin:0 0 10px 0; text-align: center" Xclass="text-muted">',
	'    Hi <?! it.user.get_first_name() ?>!',
	'   </h3>',
	'   <h3 style="margin:0 0 20px 0; text-align: center" class="text-muted">',
	'    Here is a new thing shared with you:',
	'   </h3>',
	'   <div style="padding:20px 0 10px 0" class="border-top">',
	'    <div style="float: left">',
	'     <img src="<?! it.sharing_user.get_pic_url() ?>" style="height: 40px; width: 40px" />',
	'    </div>',
	'    <div style="padding-left: 10px; overflow: hidden">',
	'     <h4 style="margin: 0" class="text-muted">',
	'      <span><?! it.sharing_user.get_name() ?></span>',
	// '      <br/><small class="text-muted">shared with you</small>',
	'     </h4>',
	'     <div style="padding: 10px 0 0 0">',
	'      <a href="https://www.noobaa.com/home/">',
	'       <h3><?! it.inode.name ?></h3>',
	'      </a>',
	'     </div>',
	'    </div>',
	'   </div>',
	'  </div>',
	'  <div style="padding: 10px 100px 20px 100px; text-align: center" class="border-top">',
	'   <a href="https://www.noobaa.com">',
	'    <img src="https://www.noobaa.com/public/images/noobaa_logo.png" height="44px" />',
	'    <div Xstyle="padding-left: 10px"><small>Connecting the dots</small></div>',
	'   </a>',
	'  </div>',
	' </div>',
	' <?~ it.tracking_pixel_urls :pixel_url:index ?>',
	'  <img src="<?! pixel_url ?>" width="1" height="1" />',
	' <?~?>',
	'</div>'
].join('\n'));

var RECENT_SWM_TEMAPLATE = dot.template([
	'<div>',
	EMAIL_STYLES,
	' <div class="nbcapsule">',
	'  <div style="padding: 30px 100px 0px 100px">',
	'   <h3 style="margin:0 0 10px 0; text-align: center" Xclass="text-muted">',
	'    Hi <?! it.user.get_first_name() ?>!',
	'   </h3>',
	'   <h3 style="margin:0 0 20px 0; text-align: center" class="text-muted">',
	'    Here are recent things shared with you:',
	'   </h3>',
	'   <?~ it.shares :inode:index ?>',
	'   <div style="padding:20px 0 10px 0" class="border-top">',
	'    <div style="float: left">',
	'     <img src="<?! inode.live_owner.get_pic_url() ?>" style="height: 40px; width: 40px" />',
	'    </div>',
	'    <div style="padding-left: 10px; overflow: hidden">',
	'     <h4 style="margin: 0" class="text-muted">',
	'      <span><?! inode.live_owner.get_name() ?></span>',
	// '      <br/><small class="text-muted">shared with you</small>',
	'     </h4>',
	'     <div style="padding: 10px 0 0 0">',
	'      <a href="https://www.noobaa.com/home/">',
	'       <h3><?! inode.live_inode.name ?></h3>',
	'      </a>',
	'     </div>',
	'    </div>',
	'   </div>',
	'   <?~?>',
	'  </div>',
	'  <div style="padding: 10px 60px 20px 100px; text-align: center" class="border-top">',
	'   <a href="https://www.noobaa.com">',
	'    <img src="https://www.noobaa.com/public/images/noobaa_logo.png" height="44px" />',
	'    <div Xstyle="padding-left: 10px"><small>Connecting the dots</small></div>',
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


exports.send_swm_notification = send_swm_notification;

function send_swm_notification(user, sharing_user, inode, callback) {
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
	var tracking_pixel_url = track_api.tracking_pixel_url('email.shared.open', null, user_info, ctx);
	var mixpanel_pixel_url = track_api.mixpanel_pixel_url('email.shared.open', user.id, ctx);
	msg.subject = inode.name + ' was shared with you by ' + sharing_user.get_first_name() + ' on NooBaa';
	msg.html = SWM_TEMAPLATE({
		user: user,
		sharing_user: sharing_user,
		inode: inode,
		tracking_pixel_urls: [tracking_pixel_url, mixpanel_pixel_url],
	});
	// don't send bcc with tracking urls
	msg.bcc_address = null;

	var bcc_msg = _.clone(msg);
	bcc_msg.to = [{
		name: msg.to[0].name,
		email: 'info@noobaa.com'
	}];
	bcc_msg.track_opens = false;
	bcc_msg.track_clicks = false;
	bcc_msg.html = SWM_TEMAPLATE({
		user: user,
		sharing_user: sharing_user,
		inode: inode,
		tracking_pixel_urls: [],
	});

	return async.parallel([
		function(next) {
			console.log('SEND SHARE MSG', user.get_name());
			return mandrill('/messages/send', {
				message: msg
			}, email_callback(next));
		},
		function(next) {
			console.log('SEND SHARE BCC', user.get_name());
			return mandrill('/messages/send', {
				message: bcc_msg
			}, email_callback(next));
		},
	], callback);
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
	var sharers_names = _.map(shares, function(inode) {
		return inode.live_owner.get_first_name();
	});
	var sharers_for_subject = _.first(_.uniq(sharers_names), 3).join(', ');
	msg.subject = sharers_for_subject + ' shared new stuff with you on NooBaa';
	msg.html = RECENT_SWM_TEMAPLATE({
		user: user,
		shares: shares,
		tracking_pixel_urls: [tracking_pixel_url, mixpanel_pixel_url],
	});
	// don't send bcc with tracking urls
	msg.bcc_address = null;

	var bcc_msg = _.clone(msg);
	bcc_msg.to = [{
		name: msg.to[0].name,
		email: 'info@noobaa.com'
	}];
	bcc_msg.track_opens = false;
	bcc_msg.track_clicks = false;
	bcc_msg.html = RECENT_SWM_TEMAPLATE({
		user: user,
		shares: shares,
		tracking_pixel_urls: [],
	});

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
	var inode = {
		name: 'Testing swm'
	};
	var shares = [{
		live_owner: user,
		live_inode: {
			name: 'Testing recent swm 1'
		}
	}, {
		live_owner: user,
		live_inode: {
			name: 'Testing recent swm 1'
		}
	}, {
		live_owner: user,
		live_inode: {
			name: 'Testing recent swm 1'
		}
	}];
	res.write('<div style="max-width: 800px; padding: 20px">');
	res.write('<div style="height: 100%"><br/>SWM<br/><br/>');
	res.write(SWM_TEMAPLATE({
		user: user,
		sharing_user: user,
		inode: inode,
		tracking_pixel_urls: [],
	}));
	res.write('</div>');
	res.write('<div style="height: 100%"><br/>RECENT SWM<br/><br/>');
	res.write(RECENT_SWM_TEMAPLATE({
		user: user,
		shares: shares,
		tracking_pixel_urls: [],
	}));
	res.write('</div>');
	res.end();
};
