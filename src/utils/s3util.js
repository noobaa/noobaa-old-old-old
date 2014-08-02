'use strict';
process.env.AWS_ACCESS_KEY_ID = 'AKIAI6M7LJIMXYCYMK7A';
process.env.AWS_SECRET_ACCESS_KEY = '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';
process.env.S3_BUCKET = 'noobaa-ireland';

process.on('uncaughtException', function(err) {
	console.log(err.stack);
});

var async = require('async');
var AWS = require('aws-sdk');

AWS.config.update({
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

var S3 = new AWS.S3();

function list_multipart_uploads(callback) {
	var key_marker = '';
	var has_more = true;
	var results = [];
	return async.whilst(
		function() {
			return key_marker !== null;
		}, function(next) {
			return S3.listMultipartUploads({
				Bucket: process.env.S3_BUCKET,
				KeyMarker: key_marker
			}, function(err, data) {
				if (err) {
					return next(err);
				}
				console.log('#results', data.Uploads.length, data.IsTruncated, data.NextKeyMarker);
				has_more = data.IsTruncated;
				key_marker = data.NextKeyMarker;
				results = results.concat(data.Uploads);
				return next();
			});
		}, function(err) {
			if (err) {
				console.error('S3.listMultipartUploads', 'FAILED', err);
			} else {
				console.log('S3.listMultipartUploads', 'done.', results.length);
			}
			return callback(err, results);
		}
	);
}

function list_parts(key, upload_id, callback) {
	var part_marker = '';
	var has_more = true;
	var results = [];
	return async.whilst(
		function() {
			return has_more;
		}, function(next) {
			return S3.listParts({
				Bucket: process.env.S3_BUCKET,
				Key: key,
				UploadId: upload_id,
				PartNumberMarker: part_marker
			}, function(err, data) {
				if (err) {
					return next(err);
				}
				console.log('#results', data.Parts.length, data.IsTruncated, data.NextPartNumberMarker);
				has_more = data.IsTruncated;
				part_marker = data.NextPartNumberMarker;
				results = results.concat(data.Parts);
				return next();
			});
		}, function(err) {
			if (err) {
				console.error('S3.listParts', 'FAILED', err);
			} else {
				console.log('S3.listParts', 'done.', results.length);
			}
			return callback(err, results);
		}
	);
}

function abort_upload(key, upload_id, callback) {
	return S3.abortMultipartUpload({
		Bucket: process.env.S3_BUCKET,
		Key: key,
		UploadId: upload_id
	}, function(err, data) {
		if (err) {
			console.error('S3.abortMultipartUpload', 'FAILED', err);
		} else {
			console.log('S3.abortMultipartUpload', 'done.', data);
		}
		return callback(err, data);
	});
}


function main() {
	var argv = require('optimist').argv;
	var cmd = argv._[0];
	if (cmd === 'list_uploads') {
		list_multipart_uploads(function(err, results) {
			console.log(results);
		});
	} else if (cmd === 'list_parts') {
		list_parts(argv.key, argv.upload_id, function(err, results) {
			console.log(results);
		});
	} else if (cmd === 'url') {
		console.log(S3.getSignedUrl(argv.op || 'getObject', {
			Bucket: process.env.S3_BUCKET,
			Key: argv.key,
			Expires: 24 * 60 * 60 // 24 hours
		}));
	} else if (cmd === 'abort') {
		abort_upload(argv.key, argv.upload_id);
	} else if (cmd === 'abort_all') {
		list_multipart_uploads(function(err, results) {
			if (!err) {
				return async.eachSeries(results, function(item, next) {
					console.log('aborting', item.Key, item.UploadId);
					return abort_upload(item.Key, item.UploadId, next);
				}, function(err) {
					console.log('abort_all done', err);
				});
			}
		});
	} else {
		console.log('unknown command', cmd);
	}
}

main();
