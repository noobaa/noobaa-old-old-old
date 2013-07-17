var inodes = require('./inode');


function treat_error(err, req, res) {
	if (err) {
		console.error('ERROR:', err);
		res.send(500, err);
		throw err;
	}
}

function init(app) {

	app.get('/star_api/readdir', function(req, res) {
		inodes.Inode.find({
			parent: req.query.id
		}, function (err, inodes) {
			treat_error(err, req, res);
			res.send({entries : inodes});
		});

		// TODO TODO TODO
	});

}

exports.init = init;