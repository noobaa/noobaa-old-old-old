var _ = require('underscore');
var AWS = require('aws-sdk');
var path = require('path');

var inode_model = require('../models/inode');
var fobj_model = require('../models/fobj');
var Inode = inode_model.Inode;
var Fobj = fobj_model.Fobj;

/* loaded automatically from env
AWS.config.update({
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.AWS_SECRET_KEY,
});
*/
AWS.config.update({
	region: 'eu-west-1'
});
var s3 = new AWS.S3;


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

function get_s3_urls(fobj_id) {
	var params = {
		Bucket: process.env.S3_BUCKET,
		Key: '/' + path.join(process.env.S3_PATH, 'fobsj', String(fobj_id)),
		Expires: 60
	};
	return {
		getObject: s3.getSignedUrl('getObject', params),
		putObject: s3.getSignedUrl('putObject', params)
	}
}

// transform the inode and optional fobj to an entry 
// that is the interface for the client.

function inode_to_entry(inode, fobj, signed_urls) {
	var ent = {
		id: inode._id,
		name: inode.name,
		isdir: inode.isdir
	};
	if (fobj) {
		ent = _.extend(ent, {
			size: fobj.size,
			uploading: fobj.uploading,
			upload_size: fobj.upload_size
		});
		if (signed_urls) {
			ent.s3 = get_s3_urls(fobj._id);
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
				return inode_to_entry(inode, fobj_map[inode.fobj]);
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
			return res.json(200, inode_to_entry(inode, fobj, true));
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
			return res.json(200, inode_to_entry(inode, fobj, true));
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
	// TODO: allow to update the uploading state in fobj
	var args = _.pick(req.body, 'parent', 'name');

	// send update
	return Inode.findByIdAndUpdate(id, args,
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
};


// INODE CRUD - DELETE

exports.inode_delete = function(req, res) {

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