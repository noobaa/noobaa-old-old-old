/* jshint node:true */
'use strict';

var _ = require('underscore');
var mongoose = require('mongoose');
var crypto = require('crypto');
var StarLog = require('../models/starlog.js').StarLog;


// add data to the request starlog, which will be attached
// to the log record that reply callback will write to the DB.
// TODO: add info in the relevant routes - tests code complicates stuff because req is not available

function starlog(req, data) {
    if (!req.starlog) {
        req.starlog = {};
    }
    _.extend(req.starlog, data);
}

// submit a starlog to the DB but don't wait for it

function submit_starlog(err, req) {
    // for now we don't want to log and READS, only WRITES
    // so filtering simply by method type which is usually correct.
    if (req.method === 'GET') {
        return;
    }
    var record = new StarLog();
    // pick fields from the request to be added to the log record
    record.req = _.pick(req,
        'user',
        'method',
        'url',
        'originalMethod',
        'originalUrl',
        'query',
        'body'
    );
    // attach error info
    if (err) {
        record.err = err;
    }
    // attach info which was put on the request with starlog()
    if (req.starlog) {
        record.log = req.starlog;
    }
    // submit save but don't wait for it, just continue and reply to the client
    record.save(function(save_err) {
        if (save_err) {
            console.error('FAILED TO SAVE STARLOG', save_err, record);
        }
    });
}

// Convinient callback maker for handling the reply of async control flows.
// Example usage:
//		async.waterfall([
//			...
//		], reply_callback(req, res, debug_info));

function reply_callback(req, res, debug_info, skip_starlog) {
    return function(err, reply) {
        /* unused for now
		if (skip_starlog !== 'skip_starlog') {
			submit_starlog(err, req);
		}
		*/
        if (err) {
            var status = err.status || err.statusCode;
            var data = err.data || err.message;
            console.log(status === 200 ? 'COMPLETED' : 'FAILED', debug_info, ':', err);
            if (typeof status === 'number' &&
                status >= 100 &&
                status < 600
            ) {
                return res.json(status, data);
            } else {
                return res.json(500, err);
            }
        }
        if (!res.headerSent) {
            console.log('COMPLETED', debug_info);
            return res.json(200, reply);
        }
    };
}

// sign the given object according to S3 requirements (HMAC, SHA1, BASE64).

function json_encode_sign(json_obj, secret) {
    var data = new Buffer(JSON.stringify(json_obj)).toString('base64').replace(/\n|\r/, '');
    var hmac = crypto.createHmac('sha1', secret);
    var hash2 = hmac.update(data);
    var sign = hmac.digest('base64');
    return {
        data: data,
        sign: sign
    };
}

function json_decode_sign(data, sign, secret) {
    var hmac = crypto.createHmac('sha1', secret);
    var hash2 = hmac.update(data);
    var result = hmac.digest('base64');
    if (result !== sign) {
        return null;
    }
    var str = new Buffer(data, 'base64').toString();
    var obj = JSON.parse(str);
    return obj;
}


function check_ownership(user_id, obj, next) {
    if (!obj) {
        return next({
            status: 404, // HTTP Not Found
            message: 'Not Found'
        });
    }
    if (!mongoose.Types.ObjectId(user_id).equals(obj.owner)) {
        return next({
            status: 403, // HTTP Forbidden
            message: 'User Not Owner'
        });
    }
    return next(null, obj);
}

// Convinient callback maker to check the object owner matching to the req.user
// Example usage:
//		async.waterfall([
//			req_ownership_checker(req),
//		], reply_callback(req, res, debug_info));

function req_ownership_checker(req) {
    return function(obj, next) {
        check_ownership(req.user.id, obj, next);
    };
}

function common_server_data(req) {
    return {
        data: {
            user: req.user,
            app_id: process.env.FACEBOOK_APP_ID,
            // TODO: channel_url expects absolute/relative/even needed?
            channel_url: '/auth/facebook/channel.html',
            mixpanel_token: process.env.MIXPANEL_TOKEN
        }
    };
}


exports.starlog = starlog;
exports.reply_callback = reply_callback;
exports.json_encode_sign = json_encode_sign;
exports.json_decode_sign = json_decode_sign;
exports.check_ownership = check_ownership;
exports.req_ownership_checker = req_ownership_checker;
exports.common_server_data = common_server_data;
