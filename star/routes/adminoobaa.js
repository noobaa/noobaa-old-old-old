/* jshint node:true */
'use strict';

var async = require('async');
var common_api = require('./common_api');
var User = require('../models/user').User;


exports.admin_view = function(req, res) {
	async.waterfall([
		User.find.bind(User)
	], function(err, users) {
		if (err) {
			return res.send(500, err);
		} else {
			var ctx = common_api.page_context(req);
			ctx.users = users;
			return res.render('adminoobaa.html', ctx);
		}
	});
};