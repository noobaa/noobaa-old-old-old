/* jshint node:true */
'use strict';

var _ = require('underscore');
var AWS = require('aws-sdk');
var path = require('path');
var moment = require('moment');
var crypto = require('crypto');
var auth = require('./auth');
var async = require('async');
var mongoose = require('mongoose');

var inode_model = require('../models/inode');
var fobj_model = require('../models/fobj');
var user_inodes = require('../providers/user_inodes');
var Inode = inode_model.Inode;
var Fobj = fobj_model.Fobj;


/* load s3 config from env*/
AWS.config.update({
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
	// region: process.env.AWS_REGION
});
var S3 = new AWS.S3();


// Convinient callback for handling the reply of async control flows.
// 'this' should be the bound to the response.
//
// Example usage:
//	async.waterfall(
//		[...],
//		reply_callback.bind(res, debug_info)
//	);

function reply_callback(debug_info, err, reply) {
	/* jshint validthis:true */
	if (err) {
		console.log('FAILED', debug_info, ':', err);
		if (err.status) {
			return this.json(err.status, err.info);
		} else {
			return this.json(500, err);
		}
	}
	if (!this.headerSent) {
		console.log('COMPLETED', debug_info);
		return this.json(200, reply);
	}
}


// Check the inode's owner matching to the req.user
// 'this' should be the bound to the request.
//
// Example usage:
//	async.waterfall([
//		check_inode_ownership.bind(req),
//		], reply_callback.bind(res, reply, debug_info)
//	);

function check_inode_ownership(inode, next) {
	/* jshint validthis:true */
	var user_id = mongoose.Types.ObjectId(this.user.id);
	if (!user_id.equals(inode.owner)) {
		return next({
			status: 403, // HTTP Forbidden
			info: 'User Not Owner'
		});
	}
	return next(null, inode);
}

// return the S3 path of the fobj

function fobj_s3_key(fobj_id) {
	return path.join(process.env.S3_PATH, 'fobjs', String(fobj_id));
}

// return a signed GET url for the fobj in S3

function s3_get_url(fobj_id, name) {
	var params = {
		Bucket: process.env.S3_BUCKET,
		Key: fobj_s3_key(fobj_id),
		Expires: 24 * 60 * 60, // 24 hours
		ResponseContentDisposition: name
	};
	return S3.getSignedUrl('getObject', params);
}

// return a signed POST form and url for the fobj in S3

function s3_post_info(fobj_id, name, content_type) {
	var key = fobj_s3_key(fobj_id);
	// create S3 policy object
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
	// sign the policy object according to S3 requirements (HMAC, SHA1, BASE64).
	var policy = new Buffer(JSON.stringify(policy_options)).toString('base64').replace(/\n|\r/, '');
	var hmac = crypto.createHmac('sha1', process.env.AWS_SECRET_ACCESS_KEY);
	var hash2 = hmac.update(policy);
	var signature = hmac.digest('base64');
	// return both the post url, and the post form
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
		// when fobj is given add its info to the entry
		ent = _.extend(ent, {
			size: opt.fobj.size,
			uploading: opt.fobj.uploading,
			upload_size: opt.fobj.upload_size
		});
		if (opt.s3_post) {
			// add S3 post info only if requested specifically
			// this requires signing which might be heavy if done all the time.
			ent.s3_post_info = s3_post_info(opt.fobj._id, inode.name, opt.content_type);
		}
		if (opt.s3_get) {
			// add S3 get info only if requested specifically
			// this requires signing which might be heavy if done all the time.
			ent.s3_get_url = s3_get_url(opt.fobj._id, inode.name);
		}
	}
	return ent;
}

// read_dir finds all the sons of the directory.
// for inodes with fobj also add the fobj info to the response.

function do_read_dir(inode, next) {
	async.waterfall([
		// query all the dir sons
		function(next) {
			return Inode.find({
				owner: inode.owner,
				parent: inode._id
			}, next);
		},

		// query the fobjs for all the entries found
		function(list, next) {
			// find all the fobjs for inode list using one big query.
			// create the query by removing empty fobj ids.
			var fobj_ids = _.compact(_.pluck(list, 'fobj'));
			return Fobj.find({
				_id: {
					'$in': fobj_ids
				}
			}, function(err, fobjs) {
				next(err, list, fobjs);
			});
		},

		// merge the list of entries with the fobjs
		function(list, fobjs, next) {
			console.log('INODE READDIR:', inode._id,
				'entries', list.length, 'fobjs', fobjs.length);
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
			return next(null, {
				entries: entries
			});
		}

	], function(err, reply) {
		// on complete, pass the reply to the read_dir callback
		next(err, reply);
	});
}

// read of file - return attributes of inode and fobj if exists

function do_read_file(inode, next) {
	return async.waterfall([
		// find fobj if exists
		function(next) {
			if (!inode.fobj) {
				return next(null, null);
			}
			return Fobj.findById(inode.fobj, next);
		},

		// convert the inode anf fobj to a reply entry
		function(fobj, next) {
			return next(null, inode_to_entry(inode, {
				fobj: fobj,
				s3_get: true
			}));
		}
	], function(err, reply) {
		// on complete, pass the reply to the read_file callback
		next(err, reply);
	});
}


// general validations preceding all the star api functions

exports.validations = function(req, res, next) {
	if (!req.user) {
		return res.send(403, "User Not Authenticated");
	}
	return next();
};


// INODE CRUD - CREATE
// create takes params from req.body which is suitable for HTTP POST.
// it can be used to create a directory inode,
// or to create a file inode which also creates an fobj.
// on success it returns a json with the inode info.

exports.inode_create = function(req, res) {

	// create args are passed in post body
	var args = req.body;

	// prepare the inode object (auto generate id).
	var inode = new Inode({
		owner: req.user.id,
		parent: args.id,
		name: args.name,
		isdir: args.isdir
	});

	// prepare fobj if needed (auto generate id).
	// then also set the link in the new inode.
	if (!inode.isdir && args.uploading) {
		var fobj = new Fobj({
			size: args.size,
			uploading: args.uploading,
			upload_size: args.upload_size
		});
		// link the inode to the fobj
		inode.fobj = fobj._id;
	}

	// start the create waterfall
	async.waterfall([

		// create relative path if needed
		// and update the created dir as the new inode parent
		function(next) {
			if (!args.relative_path) {
				return next();
			}
			// make an array out of the relative path names
			// and compact it to remove any empty strings
			var paths = _.compact(args.relative_path.split('/'));
			console.log('RELATIVE PATH:', args.relative_path, paths);
			// do reduce on the paths array and for each name in the path
			// try to find existing dir, or otherwise create it,
			// and pass the parent to the next step.
			return async.reduce(paths, args.id, function(parent_id, name, next) {
				return Inode.findOneAndUpdate({
					owner: req.user.id,
					parent: parent_id,
					name: name,
					isdir: true
				}, {}, {
					// setting upsert to create if not exist
					upsert: true
				}, function(err, inode) {
					if (err) {
						return next(err);
					}
					console.log('RELATIVE PATH - REDUCE:', parent_id, name, inode._id);
					return next(null, inode._id);
				});
			}, function(err, parent_id) {
				// finally, set the new inode parent
				console.log('RELATIVE PATH - RESULT:', parent_id);
				inode.parent = parent_id;
				next(err);
			});
		},

		// create the new fobj
		function(next) {
			if (!fobj) {
				return next();
			}
			console.log('FOBJ CREATE:', fobj);
			return fobj.save(function(err) {
				next(err);
			});
		},

		// create the new inode
		function(next) {
			console.log('INODE CREATE:', inode);
			return inode.save(function(err) {
				next(err);
			});
		},

		// convert the inode and fobj to an entry to reply
		function(next) {
			return next(null, inode_to_entry(inode, {
				fobj: fobj,
				s3_post: true,
				content_type: args.content_type
			}));
		}

		// waterfall end
	], reply_callback.bind(res, 'INODE CREATE ' + inode._id));
};


// INODE CRUD - READ

exports.inode_read = function(req, res) {

	// the inode_id param is parsed as url param (/path/to/api/:inode_id/...)
	var id = req.params.inode_id;

	// start the read waterfall
	async.waterfall([

		// find the inode
		function(next) {
			if (id === 'null') {
				// pass fictive inode to represent user root
				var inode = new Inode();
				inode._id = null;
				inode.owner = mongoose.Types.ObjectId(req.user.id);
				inode.isdir = true;
				return next(null, inode);
			}
			return Inode.findById(id, next);
		},

		// check inode ownership
		check_inode_ownership.bind(req),

		// dispatch to read dir/file
		function(inode, next) {
			if (inode.isdir) {
				return do_read_dir(inode, next);
			} else {
				// redirect to the fobj location in S3
				if (inode.fobj) {
					var url = s3_get_url(inode.fobj, inode.name);
					res.redirect(url);
					return next();
				}
				// this is actually quite unused code, 
				// keeping it in case we want a get_attr sort of logic.
				return do_read_file(inode, next);
			}
		},

		// waterfall end
	], reply_callback.bind(res, 'INODE READ ' + id));
};


// INODE CRUD - UPDATE

exports.inode_update = function(req, res) {

	// the inode_id param is parsed as url param (/path/to/api/:inode_id/...)
	var id = req.params.inode_id;

	// we pick only the keys we allow to update from the request body
	// TODO: check the validity of the input
	var inode_args = _.pick(req.body, 'parent', 'name');
	var fobj_args = _.pick(req.body, 'uploading', 'upsize');

	// start the update waterfall
	async.waterfall([

		// pass the id
		function(next) {
			return next(null, id);
		},

		// find the inode
		Inode.findById.bind(Inode),

		// check inode ownership
		check_inode_ownership.bind(req),

		// update the inode
		function(inode, next) {
			if (_.isEmpty(inode_args)) {
				return next(null, inode);
			}
			console.log('INODE UPDATE:', id, inode_args);
			return inode.update(inode_args, function(err) {
				return next(err, inode);
			});
		},

		// update the fobj
		function(inode, next) {
			if (_.isEmpty(fobj_args)) {
				return next(null, inode);
			}
			if (!inode.fobj) {
				return next({
					status: 404,
					info: 'File Object Not Found'
				});
			}
			console.log('FOBJ UPDATE:', id, inode.fobj, fobj_args);
			return Fobj.findByIdAndUpdate(inode.fobj, fobj_args, function(err) {
				return next(err, inode);
			});
		},

		// convert inode to entry for the reply
		function(inode, next) {
			return next(null, inode_to_entry(inode));
		}

		// waterfall end
	], reply_callback.bind(res, 'INODE UPDATE ' + id));
};


// INODE CRUD - DELETE

exports.inode_delete = function(req, res) {

	// the inode_id param is parsed as url param (/path/to/api/:inode_id/...)
	var id = req.params.inode_id;

	// start the delete waterfall
	async.waterfall([

		// pass the id
		function(next) {
			return next(null, id);
		},

		// find the inode
		Inode.findById.bind(Inode),

		// check inode ownership
		check_inode_ownership.bind(req),

		// for dirs count sons
		Inode.countDirSons.bind(Inode),

		// fail if dir and has sons
		function(inode, dir_son_count, next) {
			// TODO support recursive dir deletion
			if (inode.isdir && dir_son_count !== 0) {
				return next({
					status: 400,
					info: {
						text: 'Directory Not Empty',
						id: id
					}
				});
			}
			return next(null, inode);
		},

		// remove s3 object if any
		function(inode, next) {
			if (!inode.fobj) {
				return next(null, inode);
			}
			var params = {
				Bucket: process.env.S3_BUCKET,
				Key: fobj_s3_key(inode.fobj)
			};
			console.log('S3 OBJECT DELETE:', id);
			return S3.deleteObject(params, function(err) {
				return next(err, inode);
			});
		},

		// remove fobj if any
		function(inode, next) {
			if (!inode.fobj) {
				return next(null, inode);
			}
			console.log('FOBJ DELETE:', id);
			return Fobj.findByIdAndRemove(inode.fobj, function(err) {
				return next(err, inode);
			});
		},

		// delete the inode itself
		function(inode, next) {
			console.log('INODE DELETE:', id);
			return inode.remove(function(err) {
				return next(err, 'OK');
			});
		}

		// waterfall end
	], reply_callback.bind(res, 'INODE DELETE ' + id));
};

exports.inode_get_share_list = function(req, res) {
	console.log("star_api::inode_get_share_list");

	var user = req.user.id;
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
			var token = req.session.fbAccessToken;
			next(null, token);
		},
		auth.get_friends_list,
		auth.get_noobaa_friends_list,
	], function(err, users) {
		if (!err) {
			var return_list = [];
			_.each(users, function(v) {
				return_list.push({
					"name": v.fb.name,
					"shared": false,
					"fb_id": v.fb.id,
					"nb_id": v._id,
				});
			});
			return res.json(200, {
				"list": return_list
			});
		} else {
			return res.json(500, {
				text: err,
				id: inode_id
			});
		}
	});
};

exports.inode_set_share_list = function(req, res) {
	console.log("inode_set_share_list");
	var inode_id = req.params.inode_id;
	console.log("inode_id ", inode_id);
	var share_list = req.body.share_list;
	var new_nb_ids = _.pluck(_.where(share_list, {
		shared: true
	}), 'nb_id');
	console.log("new_nb_ids", new_nb_ids);

	console.log(share_list);
	async.waterfall([
		//get the list of existing users the inode is shared with
		function(next) {
			user_inodes.get_inode_refering_nb_ids(inode_id, function(err, old_nb_ids) {
				console.log("in WF 1");
				console.log(err);
				console.log(old_nb_ids);
				if (err) {
					return next(err, null);
				}
				return next(null, old_nb_ids, new_nb_ids);
			});
		},
		//transfer
		user_inodes.update_inode_ghost_refs,
	], reply_callback.bind(res, 'SHARE' + inode_id));
};