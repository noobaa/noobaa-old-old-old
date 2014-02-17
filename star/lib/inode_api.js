/* jshint node:true */
/* jshint -W099 */
'use strict';

var _ = require('underscore');
var AWS = require('aws-sdk');
var URL = require('url');
var cloudfront_signer = require('cloudfront-private-url-creator');
var path = require('path');
var fs = require('fs');
var moment = require('moment');
var auth = require('./auth');
var async = require('async');
var mongoose = require('mongoose');
var querystring = require('querystring');
var mime = require('mime');

var Inode = require('../models/inode').Inode;
var Fobj = require('../models/fobj').Fobj;
var User = require('../models/user').User;
var user_inodes = require('./user_inodes');
var email = require('./email');
var common_api = require('./common_api');


var NBLINK_SECRET = 'try-da-link'; // TODO: do something with the secret

/* load s3 config from env*/
AWS.config.update({
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
	// region: process.env.AWS_REGION
});
var S3 = new AWS.S3();

var CF_PROTO = 'https://',
	CF_DOMAIN = 'd3mqcgvn18z8e9.cloudfront.net'; // WEB
// var CF_PROTO = 'rtmp://', CF_DOMAIN = 's2eqm7dj8vji1h.cloudfront.net'; // RTMP
var CF_KEY_PAIR_ID = 'APKAITLQGNC5OYPIAU3A';
var CF_PK_PATH = path.join(__dirname, '..', 'cloudfront-keypairs', 'pk-' + CF_KEY_PAIR_ID + '.pem');
var CF_PK = fs.readFileSync(CF_PK_PATH, {
	encoding: 'utf8'
});

// return the S3 path of the fobj

function fobj_s3_key(fobj_id) {
	return path.join(process.env.S3_PATH, 'fobjs', String(fobj_id));
}

// using a strict encoding to also handle the remaining special chars

function rfc3986EncodeURIComponent(str) {
	return encodeURIComponent(str).replace(/[!'()*]/g, global.escape);
}


function name_to_content_dispos(name, is_download) {
	return (is_download ? 'attachment;' : 'inline;') + 'filename="' + rfc3986EncodeURIComponent(name) + '"';
}

function detect_content_type(type, name) {
	if (type) {
		return type;
	}
	return mime.lookup(name);
}

// return a signed GET url for the fobj in Cloudfront (origin from S3)

function s3_get_url(fobj_id, name, is_download) {
	var dateLessThan = new Date();
	dateLessThan.setHours(dateLessThan.getHours() + 12);
	var cloudfront_config = {
		privateKey: CF_PK,
		keyPairId: CF_KEY_PAIR_ID,
		dateLessThan: dateLessThan
	};
	var content_dispos = rfc3986EncodeURIComponent(name_to_content_dispos(name, is_download));
	var cloudfront_url = CF_PROTO + CF_DOMAIN + '/' + fobj_s3_key(fobj_id) +
		'?response-content-disposition=' + content_dispos;
	var signed_url = cloudfront_signer.signUrl(cloudfront_url, cloudfront_config);
	// console.log('CF URL', signed_url);
	return signed_url;
	/*
	var params = {
		Bucket: process.env.S3_BUCKET,
		Key: fobj_s3_key(fobj_id),
		Expires: 24 * 60 * 60, // 24 hours
		ResponseContentDisposition: name_to_content_dispos(name, is_download)
	};
	return S3.getSignedUrl('getObject', params);
	*/
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
		parent_id: inode.parent,
		ctime: inode.create_time,
		size: 0 // fobj will override, but needed for 0 size files without fobj
	};
	if (inode.isdir) {
		ent.isdir = inode.isdir;
	}

	if (opt && opt.user) {
		//the number of references shoudl only be displyed to the owner.
		//in case of sharing a folder which has subitems that are shared - this shoudl not be displayed
		//when the non-owner/shared with users brows this directory. 
		if (mongoose.Types.ObjectId(opt.user.id).equals(inode.owner)) {
			ent.shr = inode.shr;
			// conversion - when shr is empty we check for refs and fix shr to denote if any refs exist
			if (!inode.shr && inode.num_refs) {
				ent.shr = 'r';
			}
			ent.num_refs = inode.num_refs;
		} else {
			ent.not_mine = true;
		}
	}

	//handle inode ownership
	if (inode.live_owner) {
		ent.owner = inode.live_owner.get_user_identity_info();
		// we don't need to tell everyone about the mapping of our user ids to fb/google ids
		// so remove our user id from here.
		delete ent.owner.id;
	}

	if (opt && opt.fobj) {
		// when fobj is given add its info to the entry
		ent.size = opt.fobj.size;
		ent.content_type = opt.fobj.content_type;
		ent.uploading = opt.fobj.uploading;
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


// find all the fobjs for inode list using one big query.

function find_fobjs_for_inodes(inodes_list, callback) {
	// create the query by removing empty fobj ids.
	var fobj_ids = _.compact(_.pluck(inodes_list, 'fobj'));
	return Fobj.find({
		_id: {
			'$in': fobj_ids
		}
	}, function(err, fobjs) {
		if (err) {
			return callback(err);
		}
		// create a map from fobj._id to fobj
		var fobj_map = {};
		_.each(fobjs, function(fobj) {
			fobj_map[fobj._id] = fobj;
		});
		return callback(null, inodes_list, fobj_map);
	});
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

		// query the fobjs for all the inodes found
		find_fobjs_for_inodes,

		// merge the inodes_list of entries with the fobjs
		function(inodes_list, fobj_map, next) {
			console.log('INODE READDIR:', dir_inode._id, 'entries', inodes_list.length);
			// for each inode return an entry with both inode and fobj info
			var entries = _.map(inodes_list, function(inode) {
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

// return attributes of inode and fobj if exists

function do_get_attr(inode, next) {
	return async.waterfall([
		// find fobj if exists
		function(next) {
			if (!inode.fobj) {
				return next(null, null);
			}
			return Fobj.findById(inode.fobj, next);
		},

		// convert the inode and fobj to a reply entry
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
				if (err) {
					return next(err);
				}
				if (!fobj) {
					return next({
						status: 404,
						data: 'FOBJ NOT FOUND'
					});
				}
				return next(err, inode, fobj);
			});
		}
	], callback);
}


// when inode pointing to this fobj is deleted,
// the fobj might be deleted if no other refs exist

function unref_fobj(fobj_id, callback) {
	return async.waterfall([
		// count refs
		function(next) {
			return Inode.count({
				fobj: fobj_id
			}, next);
		},

		function(num_refs, next) {
			// currently deleting inode is still there, so we are expecting 1,
			// but will also delete if 0.
			if (num_refs === 1 || num_refs === 0) {
				return delete_fobj(fobj_id, next);
			} else {
				console.log('FOBJ has', num_refs, 'refs. leaving intact');
				return next();
			}
		}
	], callback);
}


function delete_fobj(fobj_id, callback) {
	var fobj;

	return async.waterfall([
		// find fobj
		function(next) {
			return Fobj.findById(fobj_id, function(err, fobj_result) {
				if (err) {
					return next(err);
				}
				if (!fobj_result) {
					console.log('DELETE FOBJ NOT FOUND - SKIP', fobj_id);
					// calling the top callback directly and leaving the waterfall
					return callback();
				}
				fobj = fobj_result;
				return next();
			});
		},

		// abort multipart upload if exist
		function(next) {
			if (!fobj.s3_multipart.upload_id) {
				return next();
			}
			var params = {
				Bucket: process.env.S3_BUCKET,
				Key: fobj_s3_key(fobj.id),
				UploadId: fobj.s3_multipart.upload_id
			};
			console.log('DELETE FOBJ S3.abortMultipartUpload:', params);
			return S3.abortMultipartUpload(params, function(err) {
				if (err) {
					// TODO detect NoSuchUpload error and ignore it
					console.log('DELETE FOBJ S3.abortMultipartUpload failed',
						err, typeof err, params);
				}
				return next(err);
			});
		},

		// remove s3 object if any
		function(next) {
			var params = {
				Bucket: process.env.S3_BUCKET,
				Key: fobj_s3_key(fobj.id)
			};
			console.log('DELETE FOBJ S3.deleteObject:', params);
			return S3.deleteObject(params, function(err) {
				return next(err);
			});
		},

		// remove fobj if any
		function(next) {
			console.log('FOBJ DELETE:', fobj.id);
			fobj.remove(function(err) {
				return next(err);
			});
		},
	], callback);
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

	console.log('TODO CREATE ARGS', args);
	if (args.src_dev_id) {
		inode.src_dev_id = args.src_dev_id;
		inode.src_dev_path = args.src_dev_path;
	}

	// prepare fobj if needed (auto generate id).
	// then also set the link in the new inode.
	var fobj;
	if (!inode.isdir && args.uploading && args.size) {
		fobj = new Fobj({
			size: args.size,
			content_type: detect_content_type(args.content_type, args.name),
			uploading: !! args.uploading,
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
			return validate_inode_creation_conditions(inode, fobj, user, next);
		},

		/* TODO THIS RELATIVE PATH HADNLING IS BROKEN AND SEEMS UNNEEDED FOR NOW
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
		*/

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


// return all the inodes of the user, with query options

exports.inode_query = function(req, res) {
	async.waterfall([

		function(next) {
			// TODO must add paging when too many inodes!
			var q = Inode.find({
				owner: req.user.id,
			});
			if (req.query.sbm) {
				q.or([{
					num_refs: {
						$gt: 0
					}
				}, {
					shr: {
						$exists: true
					}
				}]);
			}
			q.exec(next);
		},

		// query the fobjs for all the inodes found
		find_fobjs_for_inodes,

		function(inodes_list, fobj_map, next) {
			// for each inode return an entry with both inode and fobj info
			var entries = _.map(inodes_list, function(inode) {
				var ent = inode_to_entry(inode, {
					user: req.user,
					fobj: fobj_map[inode.fobj]
				});
				// ent.src_dev_id = inode.src_dev_id;
				// ent.src_dev_path = inode.src_dev_path;
				// console.log('INODE_SRC_DEV', inode, ent);
				return ent;
			});
			return next(null, {
				entries: entries
			});
		}

	], common_api.reply_callback(req, res, 'INODE READ ALL'));
};



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
						data: err
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
					data: 'Not Found'
				});
			}
			if (req.query.getattr) {
				return do_get_attr(inode, next);
			}
			if (inode.isdir) {
				return do_read_dir(req.user, inode, next);
			}
			if (!inode.fobj) {
				return next({
					status: 404, // HTTP Not Found
					data: 'Not Found'
				});
			}
			// support head request
			if (req.method === 'HEAD') {
				var params = {
					Bucket: process.env.S3_BUCKET,
					Key: fobj_s3_key(inode.fobj)
				};
				return S3.headObject(params, function(err, data) {
					if (err) {
						return next(err);
					}
					res.setHeader('Content-Length', data.ContentLength);
					res.setHeader('Content-Type', data.ContentType);
					return next();
				});
			}
			// redirect to the fobj location in S3
			var url = s3_get_url(inode.fobj, inode.name, req.query.is_download);
			if (req.query.seamless) {
				res.end('<html><body><iframe width="100%" height="100%" seamless src="' + url + '"></body></html>');
			} else {
				res.redirect(url);
			}
			// var ctx = common_api.page_context(req);
			// ctx.url = url;
			// res.render('media.html', ctx);
			return next();
		},

		// waterfall end
	], common_api.reply_callback(req, res, 'INODE READ ' + inode_id));
};


// INODE CRUD - UPDATE

exports.inode_update = function(req, res) {

	// the inode_id param is parsed as url param (/path/to/api/:inode_id/...)
	var inode_id = req.params.inode_id;

	// we pick only the keys we allow to update from the request body
	var inode_args = _.pick(req.body, 'parent', 'name');
	// convert the request to remove src_dev_id to proper $unset update
	if (req.body.src_dev_id === null) {
		inode_args.$unset = {
			src_dev_id: 1
		};
	}
	// TODO updating the uploading is deprecated, maybe remove the code path?
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
					data: 'File Object Not Found'
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
					data: 'Cannot Delete Root'
				});
			}
			return next(null, inode);
		},

		// for dirs check sons
		Inode.isDirHasSons.bind(Inode),

		// fail if dir and has sons
		function(inode, has_sons, next) {
			if (inode.isdir && has_sons) {
				return next({
					status: 400,
					data: 'Directory Not Empty'
				});
			}
			return next(null, inode);
		},

		// remove fobj if any
		function(inode, next) {
			if (!inode.fobj) {
				return next(null, inode);
			}
			return unref_fobj(inode.fobj, function(err) {
				return next(err, inode);
			});
		},

		// remove any ghost refs
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

	], callback);
}


/////////////////////////////////////
/////////////////////////////////////
// QUERY INODES WITH SOURCE DEVICE //
/////////////////////////////////////
/////////////////////////////////////

exports.inode_source_device = function(req, res) {
	var device_id = req.params.device_id;

	async.waterfall([
		function(next) {
			var selector = {
				owner: req.user.id,
			};
			if (device_id && device_id !== 'undefined') {
				selector.src_dev_id = device_id;
			} else {
				selector.src_dev_id = {
					$exists: true
				};
			}
			return Inode.find(selector, next);
		},

		// query the fobjs for all the inodes found
		find_fobjs_for_inodes,

		function(inodes_list, fobj_map, next) {
			// for each inode return an entry with both inode and fobj info
			var entries = _.map(inodes_list, function(inode) {
				var ent = inode_to_entry(inode, {
					user: req.user,
					fobj: fobj_map[inode.fobj]
				});
				ent.src_dev_id = inode.src_dev_id;
				ent.src_dev_path = inode.src_dev_path;
				console.log('INODE_SRC_DEV', inode, ent);
				return ent;
			});
			return next(null, {
				entries: entries
			});
		}

	], common_api.reply_callback(req, res, 'INODE_SRC_DEV ' + device_id));
};



///////////////
///////////////
// MULTIPART //
///////////////
///////////////


exports.inode_multipart = function(req, res) {
	var inode_id = req.params.inode_id;

	// client will pass part_number_marker to get incremental results
	// but to complete the upload it will call without part_number_marker
	// and we will collect all parts to send to completeMultipartUpload().
	var part_number_marker = req.body.part_number_marker ?
		parseInt(req.body.part_number_marker, 10) : 0;

	// flow context variables
	var inode, fobj, fresh;

	async.waterfall([
		// find inode and the fobj
		function(next) {
			return get_inode_fobj(req, inode_id, next);
		},

		// save inode and fobj in function context
		function(inode_result, fobj_result, next) {
			inode = inode_result;
			fobj = fobj_result;
			if (!fobj || !fobj.uploading) {
				// we want to reply immediately so breaking the waterfall by raising error-like status 200
				return next({
					status: 200,
					data: {
						complete: true
					}
				});
			}
			if (fobj.size <= 0) {
				return next({
					status: 400,
					data: 'FOBJ INVALID SIZE'
				});
			}
			// create the multipart upload id at S3 if not already created
			if (fobj.s3_multipart.upload_id) {
				return next();
			}
			fresh = true;
			return create_upload(inode, fobj, next);
		},

		// get list of parts from S3
		function(next) {
			if (fresh) {
				// no need to list when just created
				return next(null, [], 0);
			}
			return list_upload_parts(fobj, part_number_marker, next);
		},

		// check if upload is complete and reply.
		// if missing parts - return the first missing part numbers.
		// if done, complete the upload and save the 
		// complete is only relevant if we didn't receive a skip marker
		function(parts, upsize, next) {
			var missing_parts = find_missing_parts(fobj, parts);
			console.log('FOBJ UPLOAD STATUS num parts', parts.length,
				'upsize', upsize, 'num missing', missing_parts.length);
			if (part_number_marker === 0 && missing_parts.length === 0) {
				return complete_upload(fobj, parts, function(err) {
					return next(err, {
						complete: true
					});
				});
			} else {
				console.log('UPLOAD NOT COMPLETE', fobj, 'MISSING', missing_parts, 'upsize', upsize);
				return next(null, {
					complete: false,
					part_size: fobj.s3_multipart.part_size,
					upsize: upsize,
					missing_parts: missing_parts,
				});
			}
		}
	], common_api.reply_callback(req, res, 'INODE_MULTIPART ' + inode_id));
};

// get full list of multipart upload parts from S3

function list_upload_parts(fobj, part_number_marker, callback) {
	var marker = part_number_marker;
	var list_done = false;
	var parts = [];
	var upsize = 0;

	return async.whilst(function() {
		// continue listing until done or enough missing parts collected
		return !list_done;

	}, function(next) {
		var params = {
			Bucket: process.env.S3_BUCKET,
			Key: fobj_s3_key(fobj.id),
			UploadId: fobj.s3_multipart.upload_id,
			PartNumberMarker: marker.toString()
		};
		console.log('S3.listParts', params);
		return S3.listParts(params, function(err, data) {
			if (err) {
				return next(err);
			}
			// fill parts from result
			for (var i = 0; i < data.Parts.length; i++) {
				var p = data.Parts[i];
				parts[p.PartNumber - 1] = p;
				if (p.ETag) {
					// TODO best move here the part validity instead in find_missing_parts()
					upsize += p.Size;
				}
				// console.log('PART', p);
			}
			// advance marker if not done
			if (data.IsTruncated) {
				marker = data.NextPartNumberMarker;
			} else {
				list_done = true;
			}
			return next();
		});
	}, function(err) {
		return callback(err, parts, upsize);
	});
}

function find_missing_parts(fobj, parts) {
	// calculate number of parts and last_part_size (the only one which is not part_size)
	var part_size = fobj.s3_multipart.part_size;
	var num_parts = Math.floor(fobj.size / part_size);
	var last_part_size = fobj.size - (num_parts * part_size);
	if (last_part_size) {
		num_parts++;
	}
	// find first missing parts
	var missing_parts = [];
	// notice that parts numbers are indexed by 1 based index
	// but in parts array we shift them to zero based index
	for (var i = 1; i <= num_parts; i++) {
		var p = parts[i - 1];
		// part is valid if both etag and size is complete
		if (p && p.ETag &&
			((i < num_parts && p.Size === part_size) ||
				(i === num_parts && p.Size === last_part_size))) {
			// we need to remove extra fields for completeMulitpartUpload() to work
			parts[i - 1] = {
				PartNumber: p.PartNumber,
				ETag: p.ETag
			};
		} else {
			missing_parts.push({
				num: i,
				url: get_upload_part_url(fobj, i)
			});
			// send a bunch of missing parts
			if (missing_parts.length >= 2) {
				break;
			}
		}
	}
	return missing_parts;
}

function get_upload_part_url(fobj, part_num) {
	var params = {
		Bucket: process.env.S3_BUCKET,
		Key: fobj_s3_key(fobj.id),
		UploadId: fobj.s3_multipart.upload_id,
		PartNumber: part_num.toString(),
		Expires: 1 * 60 * 60, // 1 hours
	};
	return S3.getSignedUrl('uploadPart', params);
}


function create_upload(inode, fobj, callback) {
	return async.waterfall([
		// create the multipart upload id at S3
		function(next) {
			var params = {
				Bucket: process.env.S3_BUCKET,
				Key: fobj_s3_key(fobj.id),
				ACL: 'private',
				ContentDisposition: name_to_content_dispos(inode.name),
				ContentType: fobj.content_type
			};
			console.log('S3.createMultipartUpload', params);
			return S3.createMultipartUpload(params, function(err, data) {
				return next(err, data);
			});
		},

		// save the fobj with upload id info
		function(create_data, next) {
			fobj.s3_multipart = {
				upload_id: create_data.UploadId,
				// minimum part size by s3 is 5MB
				// we pick the next power of 2.
				part_size: 8 * 1024 * 1024,
			};
			return fobj.save(function(err) {
				return next(err);
			});
		}
	], callback);
}

function complete_upload(fobj, parts, callback) {
	return async.waterfall([
		// complete the upload at S3
		function(next) {
			var params = {
				Bucket: process.env.S3_BUCKET,
				Key: fobj_s3_key(fobj.id),
				UploadId: fobj.s3_multipart.upload_id,
				MultipartUpload: {
					Parts: parts
				}
			};
			console.log('FOBJ S3.completeMultipartUpload', params);
			return S3.completeMultipartUpload(params, function(err) {
				return next(err);
			});
		},

		// remove the uploading state from fobj
		function(next) {
			console.log('FOBJ UPLOAD DONE', fobj);
			fobj.s3_multipart.upload_id = undefined;
			fobj.s3_multipart.part_size = undefined;
			fobj.uploading = undefined;
			return fobj.save(function(err) {
				return next(err);
			});
		}
	], callback);
}



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
			return async.parallel({
				// get current refering inodes and populate their users (owner)
				// (some users might not be friends any more but the user should be aware)
				ref_owners: function(next) {
					return inode.find_refs().populate('owner').select('owner').exec(next);
				},
				// get the friends list which are also noobaa users
				friends_users: function(next) {
					return auth.get_friends_and_users(req.session.tokens, function(err, friends, users) {
						return next(err, users);
					});
				}
			}, next);
		},

		function(result, next) {
			var share_map = {};
			_.each(result.friends_users, function(user) {
				share_map[user.id] = user.get_user_identity_info({
					shared: false
				});
			});
			_.each(result.ref_owners, function(inode) {
				share_map[inode.owner.id] = inode.owner.get_user_identity_info({
					shared: true
				});
			});
			return next(null, {
				list: _.values(share_map)
			});
		}
	], common_api.reply_callback(req, res, 'GET_SHARE ' + inode_id));
};


exports.inode_set_share_list = function(req, res) {
	var inode_id = req.params.inode_id;
	console.log('inode_set_share_list', inode_id);

	var shr = req.body.shr;
	var old_nb_ids;
	var new_nb_ids;

	var inode;

	async.waterfall([

		// find the inode
		function(next) {
			return Inode.findById(inode_id, next);
		},

		// check inode ownership
		common_api.req_ownership_checker(req),

		function(inode_arg, next) {
			inode = inode_arg;
			return async.parallel({
				ref_owners: function(next) {
					return inode.find_refs().select('owner').exec(next);
				},
				friends_user_ids: function(next) {
					return auth.get_friends_user_ids(req.session.tokens, next);
				}
			}, next);
		},

		function(result, next) {
			old_nb_ids = _.pluck(result.ref_owners, 'owner');
			if ((!shr || shr === 'r') && req.body.share_list) {
				new_nb_ids = _.pluck(_.where(req.body.share_list, {
					shared: true
				}), 'id');
				inode.shr = shr = 'r'; // update for legacy clients
				inode.num_refs = new_nb_ids.length;
			} else if (!shr) {
				inode.shr = undefined;
				inode.num_refs = undefined;
				new_nb_ids = [];
			} else if (shr === 'f') {
				inode.shr = 'f';
				inode.num_refs = undefined;
				new_nb_ids = result.friends_user_ids;
			} else {
				return next({
					status: 400, // bad request
					data: 'INVALID SHR'
				});
			}
			console.log('shr', shr, 'new_nb_ids', new_nb_ids, 'old_nb_ids', old_nb_ids);
			return inode.save(function(err) {
				return next(err);
			});
		},

		// add and remove referenes as needed
		function(next) {
			return user_inodes.update_inode_ghost_refs(inode, old_nb_ids, new_nb_ids, next);
		},

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
				}), 'id');
			}
			// signing the link_options with a secret to prevent tampering
			var link = common_api.json_encode_sign(link_options, NBLINK_SECRET);
			var url = URL.format({
				pathname: '/api/inode/' + inode_id,
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
			if (inode.isdir || !inode.fobj) {
				return next();
			}
			return user_inodes.get_user_usage_bytes(user.id, function(err, usage) {
				if (err) {
					next(err);
				}
				if (fobj.size + usage > user.quota) {
					console.log("User reached quota limitaion ", rejection);
					return next({
						status: 507, // HTTP Insufficient Storage
						data: {
							quota: user.quota,
							usage: usage,
							file_size: fobj.size
						}
					});
				}
				return next();
			});
		},

	], callback);
}

exports.inode_copy_action = inode_copy_action;

//all inode copies are shallow
//Deep inode copies should be initiated by the above levels. 

var ERR_CANT_COPY_SWM = new Error('SWM files can\'t be copied');
exports.ERR_CANT_COPY_SWM = ERR_CANT_COPY_SWM;

function inode_copy_action(inode, new_parent, new_name, callback) {

	if (inode.ghost_ref) {
		return callback(ERR_CANT_COPY_SWM);
	}
	var new_inode = new Inode();

	var new_local_name = new_name || inode.name;
	new_inode.parent = new_parent._id;
	new_inode.owner = new_parent.owner;
	new_inode.name = new_local_name;
	new_inode.isdir = inode.isdir;
	new_inode.fobj = inode.fobj;

	return new_inode.save(function(err) {
		return callback(err, new_inode);
	});

}

exports.inode_copy = inode_copy;

function inode_copy(req, res) {

	var args = req.body;
	var new_name = args.new_name || null;

	async.waterfall([

		//find the inode to copy
		function(next) {
			return Inode.findById(req.params.inode_id, next);
		},

		//if it's a ghost ref we'd want to copy the live inode but maintain the ghost ref name
		function(inode, next) {
			if (inode.ghost_ref) {
				new_name = inode.name;
			}
			inode.follow_ref(next);
		},

		//if no parent is provided, we'd use the primary MYD folder
		function(inode, next) {
			if (args.new_parent_id) {
				return Inode.findById(args.new_parent_id, function(err, new_parent) {
					return next(err, inode, new_parent);
				});
			}
			return user_inodes.get_user_MYD(req.user.id, function(err, new_parent) {
				return next(err, inode, new_parent);
			});
		},

		function(inode, new_parent, next) {
			return inode_copy_action(inode, new_parent, new_name, next);
		},

		function(new_inode, next) {
			return next(null, inode_to_entry(new_inode, {}));
		}
	], common_api.reply_callback(req, res, 'INODE COPY ' + req.params.inode_id));
}
