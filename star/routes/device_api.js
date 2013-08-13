/* jshint node:true */
'use strict';

exports.device_create = function(req, res) {
	console.log('TODO: DEVICE CREATE', req.body);
	return res.json(200, {
		reload: false,
		device: {
			_id: 'dev_id',
			name: 'FirstDevice'
		}
	});
};

exports.device_update = function(req, res) {
	console.log('TODO: DEVICE UPDATE', req.params, req.body);
	return res.json(200, {
		reload: false
	});
};

exports.device_list = function(req, res) {
	console.log('TODO: DEVICE LIST', req.query);
	return res.json(200, {});
};

exports.device_read = function(req, res) {
	console.log('TODO: DEVICE READ', req.params, req.query);
	return res.json(200, {});
};