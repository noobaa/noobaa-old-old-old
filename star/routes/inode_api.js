/* jshint node:true */
'use strict';

var _ = require('underscore');
var AWS = require('aws-sdk');
var URL = require('url');
var path = require('path');
var moment = require('moment');
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


var NBLINK_SECRET = 'try-da-link'; // TODO: do something with the secret

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
	var enc = common_api.json_encode_sign(policy_options, process.env.AWS_SECRET_ACCESS_KEY);
	// return both the post url, and the post form
	return {
		url: 'https://' + process.env.S3_BUCKET + '.s3.amazonaws.com',
		form: {
			'key': key,
			'AWSAccessKeyId': process.env.AWS_ACCESS_KEY_ID,
			'acl': 'private',
			'policy': enc.data,
			'signature': enc.sign,
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
		ctime: inode._id.getTimestamp()
	};
	if (inode.isdir) {
		ent.isdir = inode.isdir;
	}

	//the number of references shoudl only be displyed to the owner.
	//in case of sharing a folder which has subitems that are shared - this shoudl not be displayed
	//when the non-owner/shared with users brows this directory. 
	if (opt && opt.user && mongoose.Types.ObjectId(opt.user.id).equals(inode.owner) && inode.num_refs) {
		ent.num_refs = inode.num_refs;
	}

	//handle inode ownership
	if (inode.live_owner) {
		ent.owner_fbid = inode.live_owner.fb.id;
		ent.owner_name = inode.live_owner.fb.name;
	}
	if (opt && opt.user && !mongoose.Types.ObjectId(opt.user.id).equals(inode.owner)) {
		ent.not_mine = true;
	}

	if (opt && opt.fobj) {
		// when fobj is given add its info to the entry
		ent = _.extend(ent, {
			size: opt.fobj.size,
			uploading: opt.fobj.uploading
		});
		if (opt.s3_post) {
			// add S3 post info only if requested specifically
			// this requires signing which might be heavy if done all the time.
			ent.s3_post_info = s3_post_info(opt.fobj._id, inode.name, opt.fobj.content_type);
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
exports.do_read_dir = do_read_dir;

function do_read_dir(user, dir_inode, next) {
	async.waterfall([
		// query all the dir sons
		function(next) {
			if (dir_inode._id) {
				return Inode.find({
					owner: dir_inode.owner,
					parent: dir_inode._id
				}, next);
			} else {
				//the only case where the parent is EXPECTED to be null, is one of the basic folders
				return Inode.find({
					owner: dir_inode.owner,
					parent: dir_inode._id,
					name: {
						'$in': _.values(user_inodes.CONST_BASE_FOLDERS)
					}
				}, next);
			}
		},

		//for each inode which is a ghost, "inject" the fobj id of the original file. This is used to
		//access object properties such as size and state. 
		function(inodes_list, next) {
			//get all inode id's that are referenced by ghosts. 
			var ghost_inode = _.filter(inodes_list, function(i) {
				return i.ghost_ref;
			});
			var referenced_list = _.pluck(ghost_inode, 'ghost_ref');

			//get all referenced inodes from the DB
			Inode.find({
				_id: {
					'$in': referenced_list
				}
			}, function(err, live_inodes) {
				if (err) {
					return next(err);
				}
				var live_owners_ids = [];
				var live_inode_map = {}; // a map with key:inode_id -> inode
				_.each(live_inodes, function(v) {
					live_inode_map[v._id] = v;
				});
				_.each(inodes_list, function(i) {
					//for each inode that has a ghost ref - get it's original inodes fobs and owner info 
					if (i.ghost_ref && live_inode_map[i.ghost_ref]) {
						i.fobj = live_inode_map[i.ghost_ref].fobj;
						i.live_owner_id = live_inode_map[i.ghost_ref].owner;
						live_owners_ids.push(i.live_owner_id);
					}

					//get all inodes that are not owned by the current user. This can happen when browsing 
					//a folder that has a shared/ghost parent
					if (!mongoose.Types.ObjectId(user.id).equals(i.owner)) {
						live_owners_ids.push(i.owner);
					}
				});
				next(null, inodes_list, live_owners_ids);
			});
		},

		//this function gets information about the users that are not the current user
		//these can be owners of ghost refs or owners of subfolders of ghostrefs.
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
				var live_owner_map = {}; //map of user_id->user
				_.each(users, function(v) {
					live_owner_map[v._id] = v;
				});

				_.each(inodes_list, function(i) {
					// this is true for ghost refs as we injected the info above
					if (i.live_owner_id) {
						i.live_owner = live_owner_map[i.live_owner_id];
					}

					//this is true for unowned inodes
					if (!mongoose.Types.ObjectId(user.id).equals(i.owner)) {
						i.live_owner = live_owner_map[i.owner];
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
			console.log('INODE READDIR:', dir_inode._id,
				'entries', list.length, 'fobjs', fobjs.length);
			// create a map from fobj._id to fobj
			var fobj_map = {};
			_.each(fobjs, function(fobj) {
				fobj_map[fobj._id] = fobj;
			});

			// for each inode return an entry with both inode and fobj info
			var entries = _.map(list, function(inode) {
				return inode_to_entry(inode, {
					user: user,
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
	var fobj;
	if (!inode.isdir && args.uploading) {
		fobj = new Fobj({
			size: args.size,
			content_type: args.content_type,
			uploading: args.uploading,
		});
		// link the inode to the fobj
		inode.fobj = fobj._id;
	}

	return inode_create_action(inode,
		fobj,
		req.user,
		args.relative_path,
		common_api.reply_callback(req, res, 'INODE CREATE ' + inode._id));

};

exports.inode_create_action = inode_create_action;

function inode_create_action(inode, fobj, user, relative_path, callback) {

	// start the create waterfall
	async.waterfall([

		function(next) {
			return validate_inode_creation_conditions(inode, fobj, user, function(err, rejection) {
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
			if (!relative_path) {
				return next();
			}
			// make an array out of the relative path names
			// and compact it to remove any empty strings
			var paths = _.compact(relative_path.split('/'));
			if (paths.length && paths[paths.length - 1] === inode.name) {
				paths = paths.slice(0, paths.length - 1);
			}
			console.log('RELATIVE PATH:', relative_path, paths);
			// do reduce on the paths array and for each name in the path
			// try to find existing dir, or otherwise create it,
			// and pass the parent to the next step.
			return async.reduce(paths, inode.parent, function(parent_id, name, next) {
				return Inode.findOneAndUpdate({
					owner: user.id,
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
				s3_post: true
			}));
		}

		// waterfall end
	], callback);
}

// INODE CRUD - READ

exports.inode_read = function(req, res) {

	// the inode_id param is parsed as url param (/path/to/api/:inode_id/...)
	var inode_id = req.params.inode_id;

	// start the read waterfall
	async.waterfall([

		// find the inode
		function(next) {
			if (inode_id === 'null') {
				// pass fictive inode to represent user root
				var inode = new Inode();
				inode._id = null;
				inode.owner = mongoose.Types.ObjectId(req.user.id);
				inode.isdir = true;
				return next(null, inode);
			}
			return Inode.findById(inode_id, next);
		},

		function(inode, next) {
			if (req.query.nblink) {
				// when nblink is sent in url query, parse it
				// and decode the link options inside.
				// these options were encoded by the owner which 
				// allowed access a file for read, to certain users.
				var nblink = JSON.parse(req.query.nblink);
				var link = common_api.json_decode_sign(
					nblink.data, nblink.sign, NBLINK_SECRET);
				var err;
				if (!link) {
					err = 'bad link (sign)';
				} else if (link.inode_id !== inode_id) {
					err = 'bad link (id)';
				} else if (link.link_vers !== inode.link_vers) {
					err = 'bad link (vers)';
				} else if (link.acl !== 'public' && !(req.user.id in link.acl)) {
					err = 'bad link (acl)';
				}
				if (err) {
					return next({
						status: 403, // forbidden
						info: err
					});
				} else {
					return next(null, inode);
				}
			} else {
				// check inode ownership
				// return common_api.check_ownership(req.user.id, inode, next);

				return common_api.check_ownership(req.user.id, inode, function(err, obj) {
					//if not error or nothing we can do about it - return as is
					if (!err || err.status == 404) {
						return next(err, obj);
					}
					return user_inodes.shared_ancestor(req.user.id, inode, function(err_ancestor, shared) {
						if (err_ancestor || !shared) {
							return next(err, null);
						}
						return next(null, inode);
					});

				});
			}
		},


		function(inode, next) {
			inode.follow_ref(next);
		},

		// dispatch to read dir/file

		function(inode, next) {
			if (!inode) {
				return next({
					status: 404, // HTTP Not Found
					info: 'Not Found'
				});
			}
			if (inode.isdir) {
				return do_read_dir(req.user, inode, next);
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
	], common_api.reply_callback(req, res, 'INODE READ ' + inode_id));
};


// INODE CRUD - UPDATE

exports.inode_update = function(req, res) {

	// the inode_id param is parsed as url param (/path/to/api/:inode_id/...)
	var inode_id = req.params.inode_id;

	// we pick only the keys we allow to update from the request body
	// TODO: check the validity of the input
	var inode_args = _.pick(req.body, 'parent', 'name');
	var fobj_args = _.pick(req.body, 'uploading');

	async.waterfall([

		// find the inode
		function(next) {
			return Inode.findById(inode_id, next);
		},

		// check inode ownership
		common_api.req_ownership_checker(req),

		// verify that the parent is owned by the user and that it is not a ghost 
		function(inode, next) {
			if (inode_args && inode_args.parent) {
				return validate_assignment_to_parent(inode_args.parent, req.user.id, function(err, parent) {
					return next(err, inode);
				});
			}
			return next(null, inode);
		},

		// update the inode
		function(inode, next) {
			if (_.isEmpty(inode_args)) {
				return next(null, inode);
			}
			console.log('INODE UPDATE:', inode_id, inode_args);
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
			console.log('FOBJ UPDATE:', inode_id, inode.fobj, fobj_args);
			return Fobj.findByIdAndUpdate(inode.fobj, fobj_args, function(err) {
				return next(err, inode);
			});
		},

		// convert inode to entry for the reply
		function(inode, next) {
			return next(null, inode_to_entry(inode));
		}

		// waterfall end
	], common_api.reply_callback(req, res, 'INODE UPDATE ' + inode_id));
};


// INODE CRUD - DELETE

exports.inode_delete = function(req, res) {

	// the inode_id param is parsed as url param (/path/to/api/:inode_id/...)
	return inode_delete_action(req.params.inode_id,
		req.user.id,
		common_api.reply_callback(req, res, 'INODE DELETE ' + req.params.inode_id));
};

exports.inode_delete_action = inode_delete_action;

function inode_delete_action(inode_id, user_id, callback) {
	// return callback(null,'just cant get ebough');

	// start the delete waterfall
	async.waterfall([

		// find the inode
		function(next) {
			return Inode.findById(inode_id, next);
		},

		// check inode ownership
		common_api.check_ownership.bind(null, user_id),

		// fail if dir is one of the root dirs of the user
		function(inode, next) {
			if (inode.parent === null) {
				return next({
					status: 400,
					info: 'Cannot Delete Root'
				});
			}
			return next(null, inode);
		},

		// for dirs check sons
		Inode.isDirHasSons.bind(Inode),

		// fail if dir and has sons
		function(inode, has_sons, next) {
			// TODO support recursive dir deletion
			if (inode.isdir && has_sons) {
				return next({
					status: 400,
					info: {
						text: 'Directory Not Empty',
						id: inode_id
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
			console.log('S3 OBJECT DELETE:', inode_id);
			return S3.deleteObject(params, function(err) {
				return next(err, inode);
			});
		},

		// remove fobj if any
		function(inode, next) {
			if (!inode.fobj) {
				return next(null, inode);
			}
			console.log('FOBJ DELETE:', inode_id);
			return Fobj.findByIdAndRemove(inode.fobj, function(err) {
				return next(err, inode);
			});
		},

		//remove any ghost refs
		function(inode, next) {
			var params = {
				ghost_ref: inode._id
			};
			return Inode.remove(params, function(err) {
				return next(err, inode);
			});
		},

		// delete the inode itself
		function(inode, next) {
			console.log('INODE DELETE:', inode_id);
			return inode.remove(function(err) {
				return next(err, 'OK');
			});
		}

		// waterfall end
		// ], callback);
	], function(err, result) {
		console.log(err);
		console.log(result);
		callback(err, result);
	});
}

// get inode, check ownership and get fobj

function get_inode_fobj(req, inode_id, callback) {
	return async.waterfall([
		// find the inode
		function(next) {
			return Inode.findById(inode_id, next);
		},

		// check inode ownership
		common_api.check_ownership.bind(null, req.user.id),

		function(inode, next) {
			if (!inode.fobj) {
				return next(null, inode, null);
			}
			return Fobj.findById(inode.fobj, function(err, fobj) {
				return next(err, inode, fobj);
			})
		}
	], callback);
}



///////////////
///////////////
// MULTIPART //
///////////////
///////////////


exports.inode_multipart_create = function(req, res) {
	var inode_id = req.params.inode_id;
	var ctx = {};

	async.waterfall([
		// find inode and the fobj
		function(next) {
			return get_inode_fobj(req, inode_id, next);
		},

		function(inode, fobj, next) {
			ctx.inode = inode;
			ctx.fobj = fobj;
			// if upload id already exists skip creating
			if (fobj.s3_multipart.upload_id) {
				return next(null, null);
			}
			// when the upload is new mark it, and ask for upload id from s3
			return S3.createMultipartUpload({
				Bucket: process.env.S3_BUCKET,
				Key: fobj_s3_key(ctx.inode.fobj)
			}, function(err, data) {
				return next(err, data);
			});
		},

		function(create_data, next) {
			console.log(ctx.fobj, next, typeof next, create_data, typeof create_data);
			if (ctx.fobj.s3_multipart.upload_id) {
				return next();
			}
			// for new upload save the upload id into the fobj
			ctx.fobj.s3_multipart = {
				upload_id: create_data.UploadId,
				next_part: 1,
				part_size: 10 * 1024 * 1024
			};
			return ctx.fobj.save(function(err) {
				return next(err);
			});
		},

		function(next) {
			return next(null, ctx.fobj.s3_multipart);
		}

	], common_api.reply_callback(req, res, 'INODE_CREATE_MULTIPART ' + inode_id));
};

exports.inode_multipart_get_part = function(req, res) {
	var inode_id = req.params.inode_id;
	var part_num = req.params.part_num;

	async.waterfall([
		// find inode and the fobj
		function(next) {
			return get_inode_fobj(req, inode_id, next);
		},

		function(inode, fobj, next) {
			var params = {
				Bucket: process.env.S3_BUCKET,
				Key: fobj_s3_key(fobj.id),
				UploadId: fobj.s3_multipart.upload_id,
				PartNumber: part_num
			};
			return next(null, {
				url: S3.getSignedUrl('uploadPart', params)
			});
		}
	], common_api.reply_callback(req, res, 'INODE_GET_MULTIPART ' + inode_id));
};

exports.inode_multipart_done_part = function(req, res) {
	var inode_id = req.params.inode_id;
	var part_num = req.params.part_num;

	async.waterfall([
		// find inode and the fobj
		function(next) {
			return get_inode_fobj(req, inode_id, next);
		},

		function(inode, fobj, next) {
			if (fobj.s3_multipart.next_part !== parseInt(part_num, 10)) {
				console.log('PART NUMBER MISTMATCH',
					'expected', fobj.s3_multipart.next_part,
					'got', part_num);
				return next({
					status: 404,
					err: 'Part number mismatch'
				});
			}
			fobj.s3_multipart.next_part++;
			return fobj.save(function(err) {
				return next(err);
			});
		}
	], common_api.reply_callback(req, res, 'INODE_GET_MULTIPART ' + inode_id));
};

exports.inode_multipart_complete = function(req, res) {
	var inode_id = req.params.inode_id;
	var ctx = {};

	async.waterfall([
		// find inode and the fobj
		function(next) {
			return get_inode_fobj(req, inode_id, next);
		},

		function(inode, fobj, next) {
			ctx.inode = inode;
			ctx.fobj = fobj;
			if (!fobj.s3_multipart.upload_id) {
				return next({
					status: 404,
					err: 'Not found multipart'
				});
			}
			return S3.completeMultipartUpload({
				Bucket: process.env.S3_BUCKET,
				Key: fobj_s3_key(fobj.id),
				UploadId: fobj.s3_multipart.upload_id
			}, function(err) {
				return next(err);
			});
		},

		function(next) {
			delete ctx.fobj.s3_multipart;
			return ctx.fobj.save(function(err) {
				return next(err);
			});
		}
	], common_api.reply_callback(req, res, 'INODE_COMPLETE_MULTIPART ' + inode_id));
};

exports.inode_multipart_abort = function(req, res) {
	var inode_id = req.params.inode_id;
	var ctx = {};

	async.waterfall([
		// find inode and the fobj
		function(next) {
			return get_inode_fobj(req, inode_id, next);
		},

		function(inode, fobj, next) {
			ctx.inode = inode;
			ctx.fobj = fobj;
			if (!fobj.s3_multipart.upload_id) {
				return next({
					status: 404,
					err: 'Not found multipart'
				});
			}
			return S3.abortMultipartUpload({
				Bucket: process.env.S3_BUCKET,
				Key: fobj_s3_key(fobj.id),
				UploadId: fobj.s3_multipart.upload_id
			}, function(err) {
				return next(err);
			});
		},

		function(next) {
			delete ctx.fobj.s3_multipart;
			return ctx.fobj.save(function(err) {
				return next(err);
			});
		}
	], common_api.reply_callback(req, res, 'INODE_ABORT_MULTIPART ' + inode_id));
};



/////////////
/////////////
// SHARING //
/////////////
/////////////


exports.inode_get_share_list = function(req, res) {

	var inode_id = req.params.inode_id;
	console.log('inode_get_share_list', inode_id);

	async.waterfall([

		// find the inode
		function(next) {
			return Inode.findById(inode_id, next);
		},

		// check inode ownership
		common_api.req_ownership_checker(req),

		function(inode, next) {
			return user_inodes.get_refering_users(inode_id, next);
		},

		function(ref_users, next) {
			return auth.get_noobaa_friends_list(req.session.fbAccessToken, function(err, friends_list) {
				return next(err, ref_users, friends_list);
			});
		},

		function(ref_users, friends_list, next) {
			var friends_not_sharing_with = _.difference(friends_list, ref_users);
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
			return next(null, {
				"list": _.values(share_users_map)
			});
		}
	], common_api.reply_callback(req, res, 'GET_SHARE ' + inode_id));
};

exports.inode_set_share_list = function(req, res) {
	var inode_id = req.params.inode_id;
	console.log('inode_set_share_list', inode_id);

	var new_nb_ids = _.pluck(_.where(req.body.share_list, {
		shared: true
	}), 'nb_id');
	console.log("new_nb_ids", new_nb_ids);

	var inode;

	async.waterfall([

		// find the inode
		function(next) {
			return Inode.findById(inode_id, next);
		},

		// check inode ownership
		common_api.req_ownership_checker(req),

		// save inode in context
		function(inode_arg, next) {
			inode = inode_arg;
			next(null, inode_id);
		},

		user_inodes.get_inode_refering_user_ids,

		function(old_nb_ids, next) {
			return user_inodes.update_inode_ghost_refs(inode_id, old_nb_ids, new_nb_ids, next);
		},

		function(next) {
			var new_num_refs = new_nb_ids.length;
			if (inode.num_refs === new_num_refs) {
				return next();
			}
			console.log('INODE UPDATE NUM_REFS:', inode_id, new_num_refs);
			return inode.update({
				num_refs: new_num_refs
			}, function(err) {
				return next(err);
			});
		}

	], common_api.reply_callback(req, res, 'SET_SHARE ' + inode_id));
};



///////////
///////////
// LINKS //
///////////
///////////


exports.inode_mklink = function(req, res) {
	var inode_id = req.params.inode_id;

	async.waterfall([

		// find the inode
		function(next) {
			return Inode.findById(inode_id, next);
		},

		// check inode ownership
		common_api.req_ownership_checker(req),

		function(inode, next) {
			// setting the link_options which will be verified upon access using this link
			var link_options = {
				inode_id: inode_id,
				link_vers: inode.link_vers,
				acl: 'public'
			};
			if (req.body.link_options) {
				link_options.acl = _.pluck(_.where(req.body.link_options.share_list, {
					shared: true
				}), 'nb_id');
			}
			// signing the link_options with a secret to prevent tampering
			var link = common_api.json_encode_sign(link_options, NBLINK_SECRET);
			var url = URL.format({
				pathname: '/star_api/inode/' + inode_id,
				query: {
					nblink: JSON.stringify(link) // link object fields: data, sign.
				}
			});
			console.log('MKLINK', url);
			return next(null, {
				url: url
			});
		}

	], common_api.reply_callback(req, res, 'MKLINK ' + inode_id));
};

exports.inode_rmlinks = function(req, res) {
	var inode_id = req.params.inode_id;

	async.waterfall([

		// find the inode
		function(next) {
			return Inode.findById(inode_id, next);
		},

		// check inode ownership
		common_api.req_ownership_checker(req),

		function(inode, next) {
			return inode.update({
				link_vers: (inode.link_vers + 1)
			}, function(err) {
				return next(err);
			});
		}

	], common_api.reply_callback(req, res, 'RMLINKS ' + inode_id));
};

//This function checks the "containing"/refered parent is valid i.e. owned and not a ghost
//this function is called when creating an inode or moving an inode .
//in the process we're putting it in a directroy by assigning it a dir inode as a parent

function validate_assignment_to_parent(parent_inode_id, user_id, callback) {
	if (!parent_inode_id || !user_id) {
		return callback(new Error('invalid input. parent: ' + parent_inode_id + ' user: ' + user_id));
	}

	return Inode.findById(parent_inode_id, function(err, parent_inode) {
		//if error - well - we failed. 
		if (err) {
			return callback(err);
		}
		//parent can't be a ghost
		if (parent_inode.ghost_ref) {
			return callback(new Error("Can't assign to a ghost inode as parent"));
		}
		//parent must by owned
		if (!mongoose.Types.ObjectId(user_id).equals(parent_inode.owner)) {
			return callback(new Error("Can't assign to a parent which is not owned by the user."));
		}
		return callback(null, parent_inode);
	});
}

function validate_inode_creation_conditions(inode, fobj, user, callback) {

	var rejection = null;

	async.waterfall([

		function(next) {
			return validate_assignment_to_parent(inode.parent, user.id, function(err, parent) {
				return next(err);
			});
		},

		//get the user to read specific quota
		function(next) {
			if (inode.isdir) {
				return next(null, null);
			}
			return User.findById(user.id, next);
		},

		//compare user quota to usage and reject if new file and usage exceeds quota
		function(user, next) {
			if (inode.isdir) {
				return next();
			}
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

exports.create_inode_copy = create_inode_copy;

//all inode copies are shallow
//Deep inode copies should be initiated by the above levels. 

var ERR_CANT_COPY_SWM = new Error('SWM files can\'t be copied');
exports.ERR_CANT_COPY_SWM = ERR_CANT_COPY_SWM;

function create_inode_copy(inode, new_parent, new_name, callback) {
	if (inode.ghost_ref) {
		return callback(ERR_CANT_COPY_SWM);
	}
	var new_local_name = new_name || inode.name;

	var new_inode = new Inode();

	new_inode.owner = inode.owner;
	new_inode.parent = new_parent._id;
	new_inode.name = new_local_name;
	new_inode.isdir = inode.isdir;
	new_inode.fobj = inode.fobj;

	return new_inode.save(callback);
}