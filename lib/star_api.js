var inodes = require('./inode');
var _ = require('underscore');

function treat_error(err, req, res) {
	if (err) {
		console.error('ERROR:', err);
		res.send(500, err);
		throw err;
	}
}

function inode_to_entry(inode) {
	return {
		id: inode._id,
		name: inode.name,
		isdir: inode.isdir
	};
}

function init(app) {

	app.use('/star_api/', function(req, res, next) {
		// TODO add general checks about the req.user etc.
		next();
	});

	// CRUD - CREATE
	app.post('/star_api/crud/:parent_id/:name', function(req, res) {
		// the parent_id and name are parsed from the crud url
		// because it makes sense as the location to create.
		var dir_id = req.params.parent_id;
		var name = req.params.name;
		// rest of the creation options are passed in post body
		var args = req.body;
		// create the inode object
		var inode = new inodes.Inode({
			owner: req.user.id,
			parent: dir_id,
			name: name,
			isdir: args.isdir
			// TODO handle file fields - uploading, size, etc
		});
		// save to the database
		return inode.save(function(err, created_inode) {
			treat_error(err, req, res);
			console.log('CREATED INODE:', created_inode);
			return res.json(inode_to_entry(created_inode));
		});
	});

	// CRUD - READ
	app.get('/star_api/crud/:inode_id', function(req, res) {
		var id = req.params.inode_id;
		var do_read_dir = function(id) {
			return inodes.Inode.read_dir(req.user.id, id, function(err, list) {
				treat_error(err, req, res);
				return res.json({
					entries: _.map(list, inode_to_entry)
				});
			});
		}
		// readdir of root
		if (id === 'null') {
			return do_read_dir(null);
		}
		// find the given inode, and read according to type
		return inodes.Inode.findById(id, function(err, inode) {
			treat_error(err, req, res);
			if (!inode) {
				return res.send(404, 'Not Found ' + id);
			}
			if (inode.isdir) {
				return do_read_dir(id);
			}
			// TODO: handle file read - return attributes and signed download link
			return res.send(400, 'TODO');
		});
	});

	// CRUD - UPDATE
	app.put('/star_api/crud/:inode_id', function(req, res) {
		var id = req.params.inode_id;
		// TODO: handle updates - rename, more?
		return res.send(404, 'TODO');
	});

	// CRUD - DELETE
	app.del('/star_api/crud/:inode_id', function(req, res) {
		var id = req.params.inode_id;
		return inodes.Inode.findById(id, function(err, inode) {
			treat_error(err, req, res);
			if (!inode) {
				return res.json(200, {
					text: 'Not Found',
					id: id
				});
			}
			if (inode.isdir) {
				// check that dir is empty
				return inodes.Inode.count_dir(req.user.id, id, function(err, count) {
					treat_error(err, req, res);
					if (count) {
						return res.json(400, {
							text: 'Directory Not Empty',
							id: id
						});
					}
					// removing dir
					return inode.remove(function(err) {
						treat_error(err, req, res);
						res.send(200);
					});
				});
			}
			// removing file
			return inode.remove(function(err) {
				treat_error(err, req, res);
				res.send(200);
			});
		});
	});
}

exports.init = init;