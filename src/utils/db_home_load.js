var i = 0;
db.trackevents.aggregate([{
	$match: {
		event: 'home.load'
	}
}, {
	$group: {
		_id: {
			id: '$user.id',
			event: '$event'
		},
		name: {
			$first: '$user.name'
		},
		time: {
			$max: '$time'
		}
	}
}, {
	$sort: {
		time: -1
	}
}]).result.forEach(function(e) {
	print('#' + (++i), ',', e.time, ',', e.name);
});
