var _ = require('underscore');
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

function inode_to_entry(inode) {
	return {
		id: inode._id,
		name: inode.name,
		isdir: inode.isdir
	};
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
	// save to the database
	return inode.save(reply_func(req, res, function(created_inode) {
		console.log('CREATED INODE:', created_inode);
		return res.json(200, inode_to_entry(created_inode));
	}));
};


// INODE CRUD - READ

exports.inode_read = function(req, res) {
	var id = req.params.inode_id;
	var do_read_dir = function(id) {
		return Inode.find({
			owner: req.user.id,
			parent: id
		}, reply_func(req, res, function(list) {
			console.log('INODE READDIR:', id);
			return res.json(200, {
				entries: _.map(list, inode_to_entry)
			});
		}));
	}
	// readdir of root
	if (id === 'null') {
		return do_read_dir(null);
	}
	// find the given inode, and read according to type
	return Inode.findById(id, reply_func(req, res, function(inode) {
		if (!inode) {
			return res.send(404, 'Not Found ' + id);
		}
		if (inode.isdir) {
			return do_read_dir(id);
		}
		// TODO: handle file read - return attributes and signed download link
		return res.send(501, 'TODO');
	}));
};


// INODE CRUD - UPDATE

exports.inode_update = function(req, res) {
	// TODO: check the validity of the input
	var id = req.params.inode_id;
	return Inode.findByIdAndUpdate(id, req.body,
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
			return res.json(200, {
				text: 'Not Found',
				id: id
			});
		}
		if (inode.isdir) {
			// check that dir is empty
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
		console.log('INODE DELETE FILE:', id);
		return inode.remove(reply_ok(req, res));
	}));
};