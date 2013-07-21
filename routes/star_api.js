var _ = require('underscore');
var AWS = require('aws-sdk');
var path = require('path');
var moment = require('moment');
var crypto = require('crypto');

var inode_model = require('../models/inode');
var fobj_model = require('../models/fobj');
var Inode = inode_model.Inode;
var Fobj = fobj_model.Fobj;
var auth = require('./auth');
var async = require('async');


/* load s3 config from env*/
AWS.config.update({
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
	// region: process.env.AWS_REGION
});
var S3 = new AWS.S3;


// reply_func returns a handler that first treats errors,
// and if no error, will call the real handler
// with given arguments besides the error argument)

function reply_func(req, res, handler) {
	return function(err, varargs) {
		if (err) {
			console.error('ERROR:', err);
			res.send(500, err);
			return;
		}
		var args = Array.prototype.slice.call(arguments, 1);
		handler.apply(null, args);
	};
}

function reply_ok(req, res) {
	return reply_func(req, res, function() {
		res.send(200);
	});
}

function fobj_s3_key(fobj_id) {
	return path.join(process.env.S3_PATH, 'fobjs', String(fobj_id));
}

function s3_get_url(fobj_id) {
	var params = {
		Bucket: process.env.S3_BUCKET,
		Key: fobj_s3_key(fobj_id),
		Expires: 24 * 60 * 60 // 24 hours
	};
	return S3.getSignedUrl('getObject', params);
}

function s3_post_info(fobj_id, name, content_type) {
	var key = fobj_s3_key(fobj_id);
	var policy_options = {
		expiration: moment.utc().add('hours', 24).format('YYYY-MM-DDTHH:mm:ss\\Z'),
		conditions: [{
			bucket: process.env.S3_BUCKET
		}, {
			acl: 'private'
		}, {
			success_action_status: '201'
		}, {
			key: key
		}, {
			'content-disposition': name
		}, {
			'content-type': content_type
		}]
	};
	var policy = new Buffer(JSON.stringify(policy_options)).toString('base64').replace(/\n|\r/, '');
	var hmac = crypto.createHmac('sha1', process.env.AWS_SECRET_ACCESS_KEY);
	var hash2 = hmac.update(policy);
	var signature = hmac.digest('base64');
	return {
		url: 'https://' + process.env.S3_BUCKET + '.s3.amazonaws.com',
		form: {
			'key': key,
			'AWSAccessKeyId': process.env.AWS_ACCESS_KEY_ID,
			'acl': 'private',
			'policy': policy,
			'signature': signature,
			'success_action_status': '201',
			'Content-Disposition': name,
			'Content-Type': content_type
		}
	};
}

// transform the inode and optional fobj to an entry 
// that is the interface for the client.

function inode_to_entry(inode, opt) {
	var ent = {
		id: inode._id,
		name: inode.name,
		isdir: inode.isdir
	};
	if (opt && opt.fobj) {
		ent = _.extend(ent, {
			size: opt.fobj.size,
			uploading: opt.fobj.uploading,
			upload_size: opt.fobj.upload_size
		});
		if (opt.s3_post) {
			ent.s3_post_info = s3_post_info(opt.fobj._id, inode.name, opt.content_type);
		}
		if (opt.s3_get) {
			ent.s3_get_url = s3_get_url(opt.fobj._id);
		}
	}
	return ent;
}

// read_dir finds all the sons of the directory, and sends a json response.
// for inodes with fobj also add the fobj info to the response.

function do_read_dir(req, res, user_id, dir_id) {
	// query all sons
	return Inode.find({
		owner: user_id,
		parent: dir_id
	}, reply_func(req, res, function(list) {
		console.log('INODE READDIR:', dir_id, 'results:', list.length);

		// find all the fobjs for inode list using one big query.
		// create the query by removing empty fobj ids.
		var fobj_ids = _.compact(_.pluck(list, 'fobj'));
		return Fobj.find({
			_id: {
				'$in': fobj_ids
			}
		}, reply_func(req, res, function(fobjs) {

			// create a map from fobj._id to fobj
			var fobj_map = {};
			_.each(fobjs, function(fobj) {
				fobj_map[fobj._id] = fobj;
			});

			// for each inode return an entry with both inode and fobj info
			var entries = _.map(list, function(inode) {
				return inode_to_entry(inode, {
					fobj: fobj_map[inode.fobj]
				});
			});
			return res.json(200, {
				entries: entries
			});
		}));
	}));
}

exports.validations = function(req, res, next) {
	// TODO add general checks about the req.user etc.
	if (!req.user) {
		return res.send(403, "User Not Authenticated");
	}
	next();
};


// INODE CRUD - CREATE
// create takes params from req.body which is suitable for HTTP POST.
// it can be used to create a directory inode,
// or to create a file inode which also creates an fobj.
// on success it returns a json with the inode info.

exports.inode_create = function(req, res) {

	// create args are passed in post body
	var args = req.body;

	// TODO handle relative_path param for dir uploads

	// prepare the inode object
	var inode = new Inode({
		owner: req.user.id,
		parent: args.id,
		name: args.name,
		isdir: args.isdir
	});

	// prepare fobj if needed.
	// the fobj instance will generate an id immediately 
	// so we put the link in the inode.
	if (!inode.isdir && args.uploading) {
		var fobj = new Fobj({
			size: args.size,
			uploading: args.uploading,
			upload_size: args.upload_size
		});
		// link the inode to the fobj
		inode.fobj = fobj._id;
	}

	// prepare a callback to save the inode 
	var do_save_inode = function() {
		return inode.save(reply_func(req, res, function() {
			console.log('CREATED INODE:', inode);
			return res.json(200, inode_to_entry(inode, {
				fobj: fobj,
				s3_post: true,
				content_type: args.content_type
			}));
		}));
	};

	if (!fobj) {
		// we can save the inode when no fobj is needed
		return do_save_inode();
	} else {
		// first save the fobj, and then save the inode
		return fobj.save(reply_func(req, res, function() {
			console.log('CREATED FOBJ:', fobj);
			do_save_inode();
		}));
	}
};


// INODE CRUD - READ

exports.inode_read = function(req, res) {

	// the inode_id param is expected to be parsed as url param
	// such as /path/to/api/:inode_id/...
	var id = req.params.inode_id;

	// readdir of root
	if (id === 'null') {
		return do_read_dir(req, res, req.user.id, null);
	}

	// find the given inode, and read according to type
	return Inode.findById(id, reply_func(req, res, function(inode) {
		if (!inode) {
			return res.json(404, {
				text: 'Not Found',
				id: id
			});
		}

		// call read_dir for directories
		if (inode.isdir) {
			return do_read_dir(req, res, req.user.id, id);
		}

		// for files - return attributes of inode and fobj if exists
		if (!inode.fobj) {
			return res.json(200, inode_to_entry(inode));
		}
		Fobj.findById(inode.fobj, reply_func(req, res, function(fobj) {
			return res.json(200, inode_to_entry(inode, {
				fobj: fobj,
				s3_get: true
			}));
		}));
	}));
};


// INODE CRUD - UPDATE

exports.inode_update = function(req, res) {

	// the inode_id param is expected to be parsed as url param
	// such as /path/to/api/:inode_id/...
	var id = req.params.inode_id;

	// we pick only the keys we allow to update from the request body
	// TODO: check the validity of the input
	var inode_args = _.pick(req.body, 'parent', 'name');
	var fobj_args = _.pick(req.body, 'uploading', 'upsize');
	console.log('PUTTTT', inode_args, fobj_args);

	if (!_.isEmpty(inode_args)) {
		return Inode.findByIdAndUpdate(id, inode_args,
			reply_func(req, res, function(inode) {
				if (!inode) {
					return res.json(404, {
						text: 'Not Found',
						id: id
					});
				}
				console.log('INODE UPDATE:', inode);
				return res.json(200, inode_to_entry(inode));
			})
		);
	}

	if (!_.isEmpty(fobj_args)) {
		return Inode.findById(id, reply_func(req, res, function(inode) {
			if (!inode) {
				return res.json(404, {
					text: 'Not Found',
					id: id
				});
			}
			if (!inode.fobj) {
				return res.json(404, {
					text: 'No File Object',
					id: id
				});
			}
			return Fobj.findByIdAndUpdate(inode.fobj, fobj_args,
				reply_func(req, res, function(fobj) {
					if (!fobj) {
						return res.json(404, {
							text: 'Stale File Object',
							id: id
						});
					}
					console.log('FOBJ UPDATE:', fobj);
					return res.json(200, inode_to_entry(inode, {
						fobj: fobj
					}));
				})
			);
		}));
	}
};


// INODE CRUD - DELETE
exports.inode_delete = function(req, res) {

	// TODO support recursive dir deletion

	// TODO: check ownership on the inode against req.user.id

	var id = req.params.inode_id;

	return Inode.findById(id, reply_func(req, res, function(inode) {
		if (!inode) {
			// delete + not-found = ok
			return res.json(200, {
				text: 'Not Found',
				id: id
			});
		}

		// for dirs, check that dir is empty
		if (inode.isdir) {
			return Inode.count({
				owner: req.user.id,
				parent: id
			}, reply_func(req, res, function(count) {
				if (count) {
					return res.json(400, {
						text: 'Directory Not Empty',
						id: id
					});
				}
				console.log('INODE DELETE DIR:', id);
				return inode.remove(reply_ok(req, res));
			}));
		}

		// TODO delete fobj !!
		console.log('INODE DELETE FILE:', id);
		return inode.remove(reply_ok(req, res));
	}));
};

exports.inode_get_share_list = function(req, res) {
	console.log("star_api::inode_get_share_list");

	var user = req.user.id
	var inode_id = req.params.inode_id;
	console.log("user ", user);
	console.log("inode_id ", inode_id);

	/*	async.waterfall([
		function(next) {
			next(null, inode_id);
		},
		Inode.getRefUsers.bind(Inode),
		function(owners_list, next) {
			User.find({
				_id: {
					'$in': _.pluck(owners_list, 'id');
				}
			})

		},
	], function(err, result) {});
*/

	async.waterfall([
		function(next) {
			console.log("entered first. Next is: ", next);
			token = req.session.fbAccessToken;
			next(null, token);
		},
		auth.get_friends_list,
		auth.get_noobaa_friends_list,
	], function(err, users) {
		if (!err) {
			console.log(users)
			users.foreach(
				console.log(entry)
			);
			return res.json(200)
/*
			{
				"name": v.Name,
				"shared": v.Shared,
				"pic": "https://graph.facebook.com/" + v.FB_ID + "/picture",
				"fb_id": v.FB_ID,
				"nb_id": k,
			}
*/
		} else {
			return res.json(500, {
				text: err,
				id: id
			});
		}
	});
}
/*
function (users,)
{
			"name":   v.Name,
			"shared": v.Shared,
			"pic":    "https://graph.facebook.com/" + v.FB_ID + "/picture",
			"fb_id":  v.FB_ID,
			"nb_id":  k,
		}
*/

exports.inode_set_share_list = function(req, res) {
	var id = req.params.inode_id;
	var shre_list = req
}