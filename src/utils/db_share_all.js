var i = 0;
db.inodes.aggregate([{
	$match: {
		ghost_ref: {
			$exists: true
		}
	}
}, {
	$group: {
		_id: {
			ghost_ref: '$ghost_ref',
		},
		ref_owner: {
			$first: '$ref_owner'
		},
		count: {
			$sum: 1
		},
		time: {
			$max: '$_id'
		}
	}
}, {
	$sort: {
		count: -1
	}
}]).result.forEach(function(e) {
	var x = db.inodes.findOne({
		_id: e._id.ghost_ref
	}, {
		name: 1,
		shr: 1
	});
	var u = db.users.findOne({
		_id: e.ref_owner
	}, {
		fb: 1,
		google: 1
	});
	var name = u.fb && u.fb.name || u.google && u.google.name;
	print('#' + (++i), ',', name, ',', e.count, ',', e.time.getTimestamp(), ',', x.shr, ',', x.name);
});
