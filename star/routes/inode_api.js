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
var querystring = require('querystring');

var Inode = require('../models/inode').Inode;
var Fobj = require('../models/fobj').Fobj;
var User = require('../models/user').User;
var user_inodes = require('../providers/user_inodes');
var email = require('./email');
var common_api = require('./common_api');
var filesize = require('filesize');

/* load s3 config from env*/
AWS.config.update({
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
	// region: process.env.AWS_REGION
});
var S3 = new AWS.S3();

// return the S3 path of the fobj

function fobj_s3_key(fobj_id) {
	return path.join(process.env.S3_PATH, 'fobjs', String(fobj_id));
}

function name_to_content_dispos(name) {
	return 'filename="' + querystring.escape(name) + '"';
}

// return a signed GET url for the fobj in S3

function s3_get_url(fobj_id, name) {
	var params = {
		Bucket: process.env.S3_BUCKET,
		Key: fobj_s3_key(fobj_id),
		Expires: 24 * 60 * 60, // 24 hours
		ResponseContentDisposition: name_to_content_dispos(name)
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
			'content-disposition': name_to_content_dispos(name)
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
			'Content-Disposition': name_to_content_dispos(name),
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
	if (inode.ghost_ref && inode.live_owner) {
		ent.shared_name = inode.live_owner.fb.name;
		ent.shared_fb_id = inode.live_owner.fb.id;
	}
	if (opt && opt.fobj) {
		// when fobj is given add its info to the entry
		ent = _.extend(ent, {
			size: opt.fobj.size,
			uploading: opt.fobj.uploading,
			upsize: opt.fobj.upsize
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
			if (inode._id) {
				return Inode.find({
					owner: inode.owner,
					parent: inode._id
				}, next);
			} else {
				//the only case where the parent is EXPECTED to be null, is one of the basic folders
				return Inode.find({
					owner: inode.owner,
					parent: inode._id,
					name: {
						'$in': _.values(user_inodes.CONST_BASE_FOLDERS)
					}
				}, next);
			}
		},

		//for each inode which is a ghost, "inject" the fobj id of the original file. This is used to
		//access object properties such as size and state. 
		function(inodes_list, next) {
			var ghost_inode = _.filter(inodes_list, function(i) {
				return i.ghost_ref;
			});
			var referenced_list = _.pluck(ghost_inode, 'ghost_ref');
			Inode.find({
				_id: {
					'$in': referenced_list
				}
			}, function(err, live_inodes) {
				if (err) {
					return next(err);
				}
				var live_owners_ids = [];
				var live_inode_map = {};
				_.each(live_inodes, function(v) {
					live_inode_map[v._id] = v;
				});
				_.each(inodes_list, function(i) {
					if (i.ghost_ref) {
						i.fobj = live_inode_map[i.ghost_ref].fobj;
						i.live_owner_id = live_inode_map[i.ghost_ref].owner;
						live_owners_ids.push(i.live_owner_id);
					}
				});
				next(null, inodes_list, live_owners_ids);
			});
		},

		function(inodes_list, live_owners_ids, next) {
			if (!live_owners_ids.length) {
				return next(null, inodes_list);
			}
			User.find({
				_id: {
					'$in': live_owners_ids
				}
			}, function(err, users) {
				if (err) {
					return next(err);
				}
				var live_owner_map = {};
				_.each(users, function(v) {
					live_owner_map[v._id] = v;
				});
				_.each(inodes_list, function(i) {
					if (i.live_owner_id) {
						i.live_owner = live_owner_map[i.live_owner_id];
					}
				});
				return next(null, inodes_list);
			});
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
			upsize: args.upsize
		});
		// link the inode to the fobj
		inode.fobj = fobj._id;
	}

	// start the create waterfall
	async.waterfall([

		function(next) {
			return validate_inode_creation_conditions(inode, fobj, req.user, function(err, rejection) {
				if (err) {
					return next(err);
				}
				if (rejection) {
					return next({
						status: 400,
						info: {
							text: 'File creation failed.',
							rejection: rejection
						}
					});
				}
				return next();
			});
		},

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
	], common_api.reply_callback.bind(res, 'INODE CREATE ' + inode._id));
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
		common_api.check_ownership.bind(req),

		function(inode, next) {
			inode.follow_ref(next);
		},

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
	], common_api.reply_callback.bind(res, 'INODE READ ' + id));
};


// INODE CRUD - UPDATE

exports.inode_update = function(req, res) {

	// the inode_id param is parsed as url param (/path/to/api/:inode_id/...)
	var id = req.params.inode_id;

	// we pick only the keys we allow to update from the request body
	// TODO: check the validity of the input
	var inode_args = _.pick(req.body, 'parent', 'name');
	var fobj_args = _.pick(req.body, 'uploading', 'upsize');

	async.waterfall([

		// pass the id
		function(next) {
			return next(null, id);
		},

		// find the inode
		Inode.findById.bind(Inode),

		// check inode ownership
		common_api.check_ownership.bind(req),

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
	], common_api.reply_callback.bind(res, 'INODE UPDATE ' + id));
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
		common_api.check_ownership.bind(req),

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
	], common_api.reply_callback.bind(res, 'INODE DELETE ' + id));
};

exports.inode_get_share_list = function(req, res) {
	console.log("star_api::inode_get_share_list");

	var user = req.user.id;
	var inode_id = req.params.inode_id;
	console.log("user ", user);
	console.log("inode_id ", inode_id);

	async.waterfall([
		function(next) {
			next(null, inode_id, req.session.fbAccessToken);
		},
		function(inode_id, token, next) {
			user_inodes.get_refering_users(inode_id, function(err, ref_users) {
				if (err) {
					return next(err);
				}
				next(null, ref_users, token);
			});
		},
		function(ref_users, token, next) {
			auth.get_noobaa_friends_list(token, function(err, friends_list) {
				if (err) {
					return next(err);
				}
				next(null, ref_users, friends_list);
			});
		},
	], function(err, ref_users, friends_list, next) {
		var friends_not_sharing_with = _.difference(friends_list, ref_users);
		if (!err) {
			var share_users_map = {};
			friends_list.forEach(function(v) {
				share_users_map[v._id] = {
					"name": v.fb.name,
					"shared": false,
					"fb_id": v.fb.id,
					"nb_id": v._id,
				};
			});
			//this may either add or modify existing entries.
			ref_users.forEach(function(v) {
				share_users_map[v._id] = {
					"name": v.fb.name,
					"shared": true,
					"fb_id": v.fb.id,
					"nb_id": v._id,
				};
			});

			var return_list = _.values(share_users_map);
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
	var new_nb_ids = _.pluck(_.where(req.body.share_list, {
		shared: true
	}), 'nb_id');
	console.log("new_nb_ids", new_nb_ids);
	async.waterfall([
		function(next) {
			next(null, inode_id);
		},
		user_inodes.get_inode_refering_user_ids,
		function(old_nb_ids, next) {
			next(null, inode_id, old_nb_ids, new_nb_ids);
		},
		user_inodes.update_inode_ghost_refs,
	], common_api.reply_callback.bind(res, 'SHARE' + inode_id));
};

function validate_inode_creation_conditions(inode, fobj, user, callback) {

	var rejection = null;

	async.waterfall([
		//get the user to read specific quota
		function(next) {
			return User.findById(user.id, next);
		},

		//compare user quota to usage and reject if new file and usage exceeds quota
		function(user, next) {
			return user_inodes.get_user_usage_bytes(user.id, function(err, usage) {
				if (err) {
					next(err);
				}
				if (fobj.size + usage > user.quota) {
					rejection = {
						reason: 'User reached quota limitaion of ' + filesize(user.quota),
						quota: user.quota,
						usage: usage,
						file_size: fobj.size
					};
					console.log("Reject: ", rejection);
					return next(null, rejection);
				}
				return next();
			});
		},
	], callback);
}
