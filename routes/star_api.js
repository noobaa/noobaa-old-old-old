var _ = require('underscore');
var AWS = require('aws-sdk');
var inode_model = require('../models/inode');
var fobj_model = require('../models/fobj');
var Inode = inode_model.Inode;
var Fobj = fobj_model.Fobj;

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

function inode_to_entry(inode, fobj) {
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
	}
	return ent;
}


exports.validations = function(req, res, next) {
	// TODO add general checks about the req.user etc.
	if (!req.user) {
		return res.send(403, "User Not Authenticated");
	}
	next();
};


// INODE CRUD - CREATE

exports.inode_create = function(req, res) {

	// create args are passed in post body
	var args = req.body;

	// create the inode object
	var inode = new Inode({
		owner: req.user.id,
		parent: args.id,
		name: args.name,
		isdir: args.isdir
		// TODO handle file fields - uploading, size, etc
	});

	// create fobj if needed
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
			return res.json(200, inode_to_entry(inode, fobj));
		}));
	};

	if (!fobj) {
		// we can save the inode when no fobj is needed
		return do_save_inode();
	} else {
		return fobj.save(reply_func(req, res, function() {
			console.log('CREATED FOBJ:', fobj);
			do_save_inode();
		}));
	}
};


// INODE CRUD - READ

exports.inode_read = function(req, res) {

	var id = req.params.inode_id;

	// prepare a callback for read_dir
	var do_read_dir = function(id) {
		// query all sons
		return Inode.find({
			owner: req.user.id,
			parent: id
		}, reply_func(req, res, function(list) {
			console.log('INODE READDIR:', id, 'results:', list.length);

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

	// readdir of root
	if (id === 'null') {
		return do_read_dir(null);
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
			return do_read_dir(id);
		}

		// for files - return attributes of inode and fobj if exists
		if (!inode.fobj) {
			return res.json(200, inode_to_entry(inode));
		}
		Fobj.findById(inode.fobj, reply_func(req, res, function(fobj) {
			// TODO return signed download link
			return res.json(200, inode_to_entry(inode, fobj));
		}));
	}));
};


// INODE CRUD - UPDATE

exports.inode_update = function(req, res) {

	// TODO: check the validity of the input
	// TODO: allow to update the uploading state in fobj

	// we pick only the keys we allow to update from the request body
	var args = _.pick(req.body, 'parent', 'name');
	var id = req.params.inode_id;

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